-- PayMongo Checkout for the booking deposit / reservation fee.
--
-- Flow: the pay page asks the server for a PayMongo Checkout Session for a
-- draft booking; the customer pays on PayMongo's hosted page (GCash, Maya,
-- card, QR Ph); PayMongo calls our webhook, which records the payment.
--
-- A PayMongo payment lands exactly where an uploaded payment proof does: a
-- `submitted` deposit row (method 'paymongo', external_reference = PayMongo
-- payment id). Staff still press "Confirm deposit", which reserves the car
-- through the existing booking gates. Money verified by PayMongo, dates
-- verified by staff — and nothing can record the same deposit twice.
--
-- 1. payments.method accepts 'paymongo'.
-- 2. public.paymongo_checkouts: one row per Checkout Session we create.
-- 3. private.paymongo_webhook_events: webhook idempotency by PayMongo event id.
-- 4. record_paymongo_checkout / apply_paymongo_checkout_paid: service_role
--    only. The browser never calls them; the Next.js server does, after it
--    has created the session (1) or verified the webhook signature (2).

-- ---------------------------------------------------------------------------
-- 1. Payment method
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check check (
    method is null
    or method in ('gcash', 'maya', 'bank', 'cash', 'other', 'paymongo')
  );

-- ---------------------------------------------------------------------------
-- 2. Checkout sessions
-- ---------------------------------------------------------------------------
create table if not exists public.paymongo_checkouts (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  checkout_session_id text not null unique
    check (checkout_session_id ~ '^cs_[A-Za-z0-9]+$'),
  amount numeric(12, 2) not null check (amount > 0),
  livemode boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired')),
  paymongo_payment_id text,
  payment_id uuid references public.payments (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paymongo_checkouts_rental_idx
  on public.paymongo_checkouts (rental_id, created_at desc);

alter table public.paymongo_checkouts enable row level security;

drop policy if exists paymongo_checkouts_select_staff on public.paymongo_checkouts;
create policy paymongo_checkouts_select_staff
on public.paymongo_checkouts for select to authenticated
using ((select private.is_org_staff()));

revoke all on public.paymongo_checkouts from anon, authenticated;
grant select on public.paymongo_checkouts to authenticated;

comment on table public.paymongo_checkouts is
  'PayMongo Checkout Sessions created for booking deposits. Written only by service_role RPCs.';

-- ---------------------------------------------------------------------------
-- 3. Webhook idempotency
-- ---------------------------------------------------------------------------
create table if not exists private.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  result text not null,
  received_at timestamptz not null default now()
);

comment on table private.paymongo_webhook_events is
  'PayMongo webhook events already handled. PayMongo retries until it gets a 2xx, so each event id is applied once.';

-- ---------------------------------------------------------------------------
-- 4a. Record a newly created Checkout Session
-- ---------------------------------------------------------------------------
create or replace function public.record_paymongo_checkout(
  p_rental_id uuid,
  p_reference_number text,
  p_checkout_session_id text,
  p_amount numeric,
  p_livemode boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental record;
  v_id uuid;
begin
  select r.id, r.status, r.payment_status, r.deposit_amount
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
    and r.reference_number = btrim(coalesce(p_reference_number, ''))
  for update;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;
  if v_rental.status <> 'draft' then
    raise exception 'This booking is already confirmed or closed.'
      using errcode = 'P0001';
  end if;
  if v_rental.payment_status in ('deposit_paid', 'paid_in_full') then
    raise exception 'Deposit for this booking was already confirmed.'
      using errcode = 'P0001';
  end if;
  if p_amount is distinct from v_rental.deposit_amount then
    raise exception 'Checkout amount does not match the booking deposit.'
      using errcode = '22023';
  end if;

  -- A newer session replaces any unpaid one for the same booking.
  update public.paymongo_checkouts
  set status = 'expired', updated_at = now()
  where rental_id = v_rental.id
    and status = 'pending';

  insert into public.paymongo_checkouts (
    rental_id, checkout_session_id, amount, livemode
  )
  values (
    v_rental.id, p_checkout_session_id, p_amount, coalesce(p_livemode, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Apply a verified checkout_session.payment.paid webhook
-- ---------------------------------------------------------------------------
create or replace function public.apply_paymongo_checkout_paid(
  p_event_id text,
  p_checkout_session_id text,
  p_paymongo_payment_id text,
  p_amount_centavos bigint,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.paymongo_checkouts%rowtype;
  v_rental_status public.rental_status;
  v_reference text;
  v_customer_name text;
  v_customer_phone text;
  v_vehicle_name text;
  v_payment_id uuid;
  v_result text;
begin
  if nullif(btrim(coalesce(p_event_id, '')), '') is null then
    raise exception 'PayMongo event id is required.' using errcode = '22023';
  end if;

  -- Replays of an event we already handled are acknowledged, not re-applied.
  insert into private.paymongo_webhook_events (event_id, event_type, result)
  values (p_event_id, 'checkout_session.payment.paid', 'processing')
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into v_checkout
  from public.paymongo_checkouts c
  where c.checkout_session_id = p_checkout_session_id
  for update;

  if not found then
    v_result := 'unknown_checkout';
  elsif v_checkout.livemode is distinct from coalesce(p_livemode, false) then
    v_result := 'mode_mismatch';
  elsif v_checkout.status = 'paid' then
    v_result := 'already_paid';
  elsif coalesce(p_amount_centavos, 0) < round(v_checkout.amount * 100) then
    v_result := 'amount_mismatch';
  else
    select r.status, r.reference_number, c.full_name, c.phone_number, v.name
    into v_rental_status, v_reference, v_customer_name, v_customer_phone, v_vehicle_name
    from public.rentals r
    join public.customers c on c.id = r.customer_id
    join public.vehicles v on v.id = r.vehicle_id
    where r.id = v_checkout.rental_id
    for update of r;

    -- Supersede any manual proof still waiting; PayMongo's is authoritative.
    update public.payments
    set status = 'cancelled',
        notes = coalesce(notes || E'\n', '') || 'Superseded by a PayMongo payment',
        updated_at = now()
    where rental_id = v_checkout.rental_id
      and payment_type = 'deposit'
      and status = 'submitted';

    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, notes, submitted_at
    )
    values (
      v_checkout.rental_id,
      'deposit',
      v_checkout.amount,
      'PHP',
      'paymongo',
      'submitted',
      left(p_paymongo_payment_id, 120),
      case
        when v_rental_status = 'draft'
          then 'Paid online via PayMongo (verified). Confirm the deposit to reserve.'
        else 'Paid online via PayMongo after the booking was '
          || v_rental_status || ' — review for refund.'
      end,
      now()
    )
    returning id into v_payment_id;

    update public.paymongo_checkouts
    set status = 'paid',
        paymongo_payment_id = p_paymongo_payment_id,
        payment_id = v_payment_id,
        paid_at = now(),
        updated_at = now()
    where id = v_checkout.id;

    perform private.refresh_rental_payment_summary(v_checkout.rental_id);
    v_result := case when v_rental_status = 'draft' then 'recorded' else 'recorded_closed' end;
  end if;

  update private.paymongo_webhook_events
  set result = v_result
  where event_id = p_event_id;

  return jsonb_build_object(
    'result', v_result,
    'rental_id', v_checkout.rental_id,
    'reference_number', v_reference,
    'amount', v_checkout.amount,
    'customer_name', v_customer_name,
    'customer_phone', v_customer_phone,
    'vehicle_name', v_vehicle_name
  );
end;
$$;

revoke all on function public.record_paymongo_checkout(uuid, text, text, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.record_paymongo_checkout(uuid, text, text, numeric, boolean)
  to service_role;

revoke all on function public.apply_paymongo_checkout_paid(text, text, text, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_paymongo_checkout_paid(text, text, text, bigint, boolean)
  to service_role;

comment on function public.record_paymongo_checkout(uuid, text, text, numeric, boolean) is
  'service_role only: stores a PayMongo Checkout Session the server just created for a draft booking.';
comment on function public.apply_paymongo_checkout_paid(text, text, text, bigint, boolean) is
  'service_role only: applies a signature-verified checkout_session.payment.paid webhook. Idempotent per event id; records a submitted paymongo deposit for staff to confirm.';
