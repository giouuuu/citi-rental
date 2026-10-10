-- Customer booking emails, sent from the database side.
--
-- Three emails, each recorded as one row in rental_notifications (an outbox):
--
--   booking_confirmed  the rental entered `reserved` (owner confirmed it, or
--                      confirmed the deposit on a draft, which reserves it)
--   deposit_confirmed  the deposit was confirmed on an already-reserved rental
--   booking_reminder   the pickup is within 24 hours
--
-- Flow: a trigger (or the cron job, for reminders) inserts the outbox row and
-- pings the `send-booking-email` Edge Function through pg_net. The function
-- claims the row with claim_rental_notification(), which re-checks the rental
-- and returns live booking details; it sends through Resend and reports back
-- with finish_rental_notification(). pg_net requests leave after commit, so a
-- rolled-back transition never emails anyone.
--
-- The function URL and shared secret live in Vault, not here:
--   booking_email_function_url  https://<ref>.supabase.co/functions/v1/send-booking-email
--   booking_email_secret        same value as the function's BOOKING_EMAIL_SECRET
-- Without them rows stay pending and the cron job retries once they exist.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table public.rental_notifications (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  kind text not null
    check (kind in ('booking_confirmed', 'deposit_confirmed', 'booking_reminder')),
  -- Reminders are keyed by pickup time so a rescheduled booking gets a fresh
  -- one; the other kinds send once per rental.
  dedupe_key text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  recipient text,
  attempts smallint not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  provider_message_id text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_notifications_once unique (rental_id, kind, dedupe_key)
);

create index rental_notifications_retry_idx
  on public.rental_notifications (status, created_at)
  where status in ('pending', 'sending', 'failed');

create trigger rental_notifications_set_updated_at
before update on public.rental_notifications
for each row execute function private.set_updated_at();

comment on table public.rental_notifications is
  'Outbox of customer booking emails. Written only by the database and the send-booking-email Edge Function.';

alter table public.rental_notifications enable row level security;
alter table public.rental_notifications force row level security;

revoke all on table public.rental_notifications from anon, authenticated;
grant select on table public.rental_notifications to authenticated;
grant all on table public.rental_notifications to service_role;

-- Shown on the rental timeline.
create policy rental_notifications_select_admin
on public.rental_notifications for select to authenticated
using ((select private.is_org_admin()));

-- ---------------------------------------------------------------------------
-- Dispatch: ping the Edge Function for one outbox row.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_rental_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'booking_email_function_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'booking_email_secret';

  if v_url is null or v_secret is null then
    raise log 'booking emails: Vault secrets missing, % left pending', p_id;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', p_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-booking-email-secret', v_secret
    ),
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function private.dispatch_rental_notification(uuid)
  from public, anon, authenticated;

create or replace function private.enqueue_rental_notification(
  p_rental_id uuid,
  p_kind text,
  p_dedupe_key text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.rental_notifications (rental_id, kind, dedupe_key)
  values (p_rental_id, p_kind, coalesce(p_dedupe_key, ''))
  on conflict on constraint rental_notifications_once do nothing
  returning id into v_id;

  if v_id is not null then
    perform private.dispatch_rental_notification(v_id);
  end if;
  return v_id;
end;
$$;

revoke all on function private.enqueue_rental_notification(uuid, text, text)
  from public, anon, authenticated;

/** Pickup time as a stable string, independent of the session time zone. */
create or replace function private.booking_reminder_key(p_start_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

-- ---------------------------------------------------------------------------
-- Trigger: queue the confirmation and deposit emails.
-- ---------------------------------------------------------------------------
create or replace function private.queue_rental_status_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'reserved'
     and (tg_op = 'INSERT' or old.status is distinct from 'reserved') then
    perform private.enqueue_rental_notification(new.id, 'booking_confirmed');
  end if;

  -- A deposit confirmed on a draft also reserves it (confirm_rental_deposit);
  -- that booking_confirmed email already says the deposit was received.
  if tg_op = 'UPDATE'
     and old.deposit_confirmed_at is null
     and new.deposit_confirmed_at is not null
     and old.status = 'reserved'
     and new.status = 'reserved' then
    perform private.enqueue_rental_notification(new.id, 'deposit_confirmed');
  end if;

  return null;
end;
$$;

revoke all on function private.queue_rental_status_emails()
  from public, anon, authenticated;

create trigger rentals_queue_status_emails
after insert or update of status, deposit_confirmed_at on public.rentals
for each row execute function private.queue_rental_status_emails();

-- ---------------------------------------------------------------------------
-- Edge Function API (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.claim_rental_notification(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.rental_notifications%rowtype;
  v_rental record;
  v_company record;
  v_recipient text;
  v_skip text;
  v_deposit_paid numeric;
begin
  select * into v_note
  from public.rental_notifications
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  -- A second ping for a row already in flight (or done) is a no-op; a send
  -- stuck for 10 minutes is assumed dead and may be retried.
  if v_note.attempts >= 5
     or v_note.status in ('sent', 'skipped')
     or (v_note.status = 'sending'
         and v_note.last_attempt_at > now() - interval '10 minutes') then
    return jsonb_build_object('claimed', false, 'reason', v_note.status);
  end if;

  select
    r.id,
    r.reference_number,
    r.status,
    r.payment_status,
    r.start_at,
    r.expected_return_at,
    r.pickup_location,
    r.return_location,
    r.destination,
    r.with_driver,
    r.quoted_total,
    r.balance_due,
    r.booking_source,
    r.created_by,
    c.full_name as customer_name,
    nullif(lower(btrim(c.email)), '') as customer_email,
    coalesce(
      nullif(btrim(v.name), ''),
      nullif(concat_ws(' ', v.make, v.model), '')
    ) as vehicle_name,
    v.year as vehicle_year,
    v.transmission::text as vehicle_transmission,
    v.seating_capacity as vehicle_seats
  into v_rental
  from public.rentals r
  join public.customers c on c.id = r.customer_id
  join public.vehicles v on v.id = r.vehicle_id
  where r.id = v_note.rental_id;

  if v_rental.status is distinct from 'reserved' then
    v_skip := 'Booking is no longer reserved.';
  elsif v_note.kind = 'booking_reminder'
        and (v_note.dedupe_key <> private.booking_reminder_key(v_rental.start_at)
             or v_rental.start_at <= now()) then
    v_skip := 'Pickup time changed or already passed.';
  end if;

  v_recipient := v_rental.customer_email;
  if v_recipient is null and v_rental.booking_source = 'public_web' then
    select nullif(lower(btrim(u.email)), '') into v_recipient
    from auth.users u
    where u.id = v_rental.created_by;
  end if;
  if v_skip is null and v_recipient is null then
    v_skip := 'No email address on file for this customer.';
  end if;

  if v_skip is not null then
    update public.rental_notifications
    set status = 'skipped', last_error = v_skip, recipient = v_recipient
    where id = p_id;
    return jsonb_build_object('claimed', false, 'reason', 'skipped');
  end if;

  update public.rental_notifications
  set
    status = 'sending',
    attempts = attempts + 1,
    last_attempt_at = now(),
    recipient = v_recipient
  where id = p_id;

  select coalesce(sum(p.amount), 0) into v_deposit_paid
  from public.payments p
  where p.rental_id = v_rental.id
    and p.payment_type = 'deposit'
    and p.status = 'confirmed';

  select
    cp.contact_phone,
    cp.contact_email,
    cp.business_address,
    coalesce(nullif(cp.timezone, ''), 'Asia/Manila') as timezone
  into v_company
  from public.company_profile cp
  limit 1;

  return jsonb_build_object(
    'claimed', true,
    'id', p_id,
    'kind', v_note.kind,
    'attempt', v_note.attempts + 1,
    'recipient', v_recipient,
    'booking', jsonb_build_object(
      'id', v_rental.id,
      'referenceNumber', v_rental.reference_number,
      'customerName', v_rental.customer_name,
      'vehicleName', v_rental.vehicle_name,
      'vehicleYear', v_rental.vehicle_year,
      'vehicleTransmission', v_rental.vehicle_transmission,
      'vehicleSeats', v_rental.vehicle_seats,
      'startAt', v_rental.start_at,
      'returnAt', v_rental.expected_return_at,
      'pickupLocation', v_rental.pickup_location,
      'returnLocation', v_rental.return_location,
      'destination', v_rental.destination,
      'withDriver', coalesce(v_rental.with_driver, false),
      'total', v_rental.quoted_total,
      'depositPaid', v_deposit_paid,
      'balanceDue', v_rental.balance_due
    ),
    'company', jsonb_build_object(
      'phone', v_company.contact_phone,
      'email', v_company.contact_email,
      'address', v_company.business_address,
      'timezone', coalesce(v_company.timezone, 'Asia/Manila')
    )
  );
end;
$$;

revoke all on function public.claim_rental_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_rental_notification(uuid) to service_role;

create or replace function public.finish_rental_notification(
  p_id uuid,
  p_sent boolean,
  p_provider_message_id text default null,
  p_error text default null,
  p_retry boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rental_notifications
  set
    status = case when p_sent then 'sent' else 'failed' end,
    sent_at = case when p_sent then now() else sent_at end,
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    last_error = case when p_sent then null else left(p_error, 1000) end,
    -- A permanent failure (bad address, rejected sender) uses up the retries.
    attempts = case when not p_sent and not p_retry then 5 else attempts end
  where id = p_id;
end;
$$;

revoke all on function public.finish_rental_notification(uuid, boolean, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_rental_notification(uuid, boolean, text, text, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- Cron: queue reminders and retry unsent rows every 15 minutes.
-- ---------------------------------------------------------------------------
create or replace function private.run_booking_email_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  -- Reminder once the pickup is within 24 hours. A booking confirmed less than
  -- 24 hours before pickup already got its details in the confirmation.
  for v_row in
    select r.id, r.start_at
    from public.rentals r
    where r.status = 'reserved'
      and r.start_at > now()
      and r.start_at <= now() + interval '24 hours'
      and not exists (
        select 1
        from public.rental_notifications n
        where n.rental_id = r.id
          and n.kind = 'booking_confirmed'
          and n.created_at > r.start_at - interval '24 hours'
      )
  loop
    perform private.enqueue_rental_notification(
      v_row.id,
      'booking_reminder',
      private.booking_reminder_key(v_row.start_at)
    );
  end loop;

  -- Retries: never dispatched (pending), failed with tries left, or a send
  -- that died mid-flight. Rows older than two days are left alone.
  for v_row in
    select n.id
    from public.rental_notifications n
    where n.created_at > now() - interval '2 days'
      and n.attempts < 5
      and (
        (n.status = 'pending' and n.created_at < now() - interval '2 minutes')
        or (n.status = 'failed' and n.last_attempt_at < now() - interval '10 minutes')
        or (n.status = 'sending' and n.last_attempt_at < now() - interval '10 minutes')
      )
    order by n.created_at
    limit 50
  loop
    perform private.dispatch_rental_notification(v_row.id);
  end loop;
end;
$$;

revoke all on function private.run_booking_email_jobs()
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'booking-emails') then
    perform cron.unschedule('booking-emails');
  end if;
  perform cron.schedule(
    'booking-emails',
    '*/15 * * * *',
    'select private.run_booking_email_jobs()'
  );
end
$$;
