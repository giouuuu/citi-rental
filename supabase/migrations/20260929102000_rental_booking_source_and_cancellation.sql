-- Rental booking source + structured cancellation.
--
-- 1. rentals.booking_source ('ops' | 'public_web'). The app used to infer a
--    public booking from a 'WEB-' reference prefix; existing rows are
--    backfilled from that rule and create_public_booking now stamps it.
-- 2. rentals.cancelled_at / cancellation_reason. cancelled_at is stamped by a
--    trigger whenever a rental becomes cancelled (any write path); existing
--    cancelled rentals are backfilled from updated_at (best available proxy).
-- 3. transition_rental gains a trailing p_cancellation_reason (validated,
--    stored when cancelling, included in the audit log).
-- 4. Indexes for the analytics RPCs.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.rentals
  add column if not exists booking_source text not null default 'ops',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.rentals
  drop constraint if exists rentals_booking_source_check;
alter table public.rentals
  add constraint rentals_booking_source_check
  check (booking_source in ('ops', 'public_web'));

alter table public.rentals
  drop constraint if exists rentals_cancellation_reason_check;
alter table public.rentals
  add constraint rentals_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'customer_request', 'no_show', 'payment_not_received',
      'vehicle_unavailable', 'duplicate', 'other'
    )
  );

comment on column public.rentals.booking_source is
  'Where the booking was created: ops (staff app) or public_web (customer site).';
comment on column public.rentals.cancelled_at is
  'When the rental became cancelled. Stamped by trigger; backfilled from updated_at for legacy rows.';
comment on column public.rentals.cancellation_reason is
  'Structured cancellation reason captured by transition_rental.';

-- ---------------------------------------------------------------------------
-- Backfill. Row triggers are disabled for this one statement: the booking
-- gate trigger (validate_rental_change) re-checks vehicle status, schedule,
-- blocked customers and consent on every UPDATE and must not fail or rewrite
-- legacy rows, and set_updated_at would clobber the updated_at we copy from.
-- ---------------------------------------------------------------------------

alter table public.rentals disable trigger user;

update public.rentals
set
  booking_source = case
    when reference_number ilike 'WEB-%' then 'public_web'
    else booking_source
  end,
  cancelled_at = case
    when status = 'cancelled' then coalesce(cancelled_at, updated_at)
    else cancelled_at
  end
where reference_number ilike 'WEB-%'
   or (status = 'cancelled' and cancelled_at is null);

alter table public.rentals enable trigger user;

-- ---------------------------------------------------------------------------
-- Stamp cancelled_at on every path that cancels a rental
-- ---------------------------------------------------------------------------

create or replace function private.stamp_rental_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    if tg_op = 'INSERT' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    elsif old.status is distinct from 'cancelled' then
      new.cancelled_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_rental_cancellation()
  from public, anon, authenticated, service_role;

drop trigger if exists rentals_stamp_cancellation on public.rentals;
create trigger rentals_stamp_cancellation
before insert or update of status on public.rentals
for each row execute function private.stamp_rental_cancellation();

-- ---------------------------------------------------------------------------
-- transition_rental(+ p_cancellation_reason)
-- Body copied from the newest definition in
-- 20260803120000_vehicle_gallery_inspection_hardening.sql.
-- The impl keeps its 6 leading params, so existing 6-arg internal callers
-- (confirm_rental_deposit) still resolve via the trailing default.
-- ---------------------------------------------------------------------------

drop function if exists public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
);
drop function if exists private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
);

create or replace function private.transition_rental_impl(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz,
  p_ending_odometer numeric,
  p_ending_fuel_level numeric,
  p_notes text,
  p_cancellation_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_reason text := nullif(lower(btrim(coalesce(p_cancellation_reason, ''))), '');
  v_new_data jsonb;
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  if v_reason is not null and v_reason not in (
    'customer_request', 'no_show', 'payment_not_received',
    'vehicle_unavailable', 'duplicate', 'other'
  ) then
    raise exception 'Invalid cancellation reason: %.', p_cancellation_reason
      using errcode = '22023';
  end if;

  perform 1 from public.rentals r
  where r.id = p_rental_id and r.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  if p_status = 'active'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
        and i.organization_id = v_organization_id
        and i.inspection_type = 'pickup'
    ) then
    raise exception
      'Complete a pickup inspection before starting this rental.'
      using errcode = 'check_violation';
  end if;

  if p_status = 'completed'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
        and i.organization_id = v_organization_id
        and i.inspection_type = 'return'
    ) then
    raise exception
      'Complete a return inspection before completing this rental.'
      using errcode = 'check_violation';
  end if;

  update public.rentals
  set status = p_status,
      actual_return_at = case
        when p_status = 'completed' then coalesce(p_actual_return_at, now())
        else actual_return_at
      end,
      ending_odometer = coalesce(p_ending_odometer, ending_odometer),
      ending_fuel_level = coalesce(p_ending_fuel_level, ending_fuel_level),
      notes = coalesce(p_notes, notes),
      cancellation_reason = case
        when p_status = 'cancelled' then v_reason
        else cancellation_reason
      end
  where id = p_rental_id and organization_id = v_organization_id;

  v_new_data := jsonb_build_object('status', p_status);
  if p_status = 'cancelled' then
    v_new_data := v_new_data || jsonb_build_object('cancellation_reason', v_reason);
  end if;

  perform private.write_audit_log(
    v_organization_id,
    'rental.transitioned',
    'rental',
    p_rental_id,
    null,
    v_new_data,
    '{}'::jsonb
  );
  return p_rental_id;
end;
$$;

create or replace function public.transition_rental(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz default null,
  p_ending_odometer numeric default null,
  p_ending_fuel_level numeric default null,
  p_notes text default null,
  p_cancellation_reason text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transition_rental_impl(
    p_rental_id, p_status, p_actual_return_at, p_ending_odometer,
    p_ending_fuel_level, p_notes, p_cancellation_reason
  )
$$;

revoke execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
) to authenticated;

revoke execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
) to authenticated;

comment on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
) is
  'Staff rental status transition with inspection gates; p_cancellation_reason is stored when cancelling.';

-- ---------------------------------------------------------------------------
-- Analytics indexes (existing: (org, status, expected_return_at),
-- (org, vehicle_id, start_at, expected_return_at) where occupying,
-- payments (org, rental_id, created_at) and (rental_id, type, status)).
-- ---------------------------------------------------------------------------

create index if not exists rentals_org_created_at_idx
  on public.rentals (organization_id, created_at);
create index if not exists rentals_org_start_at_idx
  on public.rentals (organization_id, start_at);
create index if not exists rentals_org_cancelled_at_idx
  on public.rentals (organization_id, cancelled_at)
  where cancelled_at is not null;
create index if not exists rentals_org_actual_return_at_idx
  on public.rentals (organization_id, actual_return_at)
  where actual_return_at is not null;
create index if not exists payments_org_confirmed_at_idx
  on public.payments (organization_id, confirmed_at)
  where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- create_public_booking: stamp booking_source = 'public_web'.
-- Body copied from 20260929101000_public_booking_identity_hardening.sql
-- (identity hardening preserved).
-- ---------------------------------------------------------------------------

create or replace function public.create_public_booking(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_full_name text,
  p_phone_number text,
  p_email text,
  p_drivers_license_number text,
  p_pickup_location text default null,
  p_return_location text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_vehicle_status public.vehicle_status;
  v_vehicle_name text;
  v_daily_rate numeric(12, 2);
  v_deposit_percent numeric(5, 2);
  v_days integer;
  v_quoted_total numeric(12, 2);
  v_deposit_amount numeric(12, 2);
  v_balance_due numeric(12, 2);
  v_conflict record;
  v_customer_id uuid;
  v_existing public.customers%rowtype;
  v_contact_note text;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone_number, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_license text := btrim(coalesce(p_drivers_license_number, ''));
  v_pickup text := nullif(btrim(coalesce(p_pickup_location, '')), '');
  v_return text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_rental_notes text;
  v_reference text;
  v_rental_id uuid;
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
begin
  if p_vehicle_id is null then
    raise exception 'Select a vehicle to book.' using errcode = '22023';
  end if;
  if p_start_at is null or p_expected_return_at is null then
    raise exception 'Pick-up and return dates are required.' using errcode = '22023';
  end if;
  if p_expected_return_at <= p_start_at then
    raise exception 'Return must be after pick-up.' using errcode = '22023';
  end if;
  if p_start_at < (now() - interval '1 hour') then
    raise exception 'Pick-up must be in the future.' using errcode = '22023';
  end if;
  if char_length(v_full_name) not between 2 and 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;
  if char_length(v_phone) not between 7 and 40 then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if char_length(v_license) not between 3 and 80 then
    raise exception 'Enter your driver license number.' using errcode = '22023';
  end if;

  -- Signed-in customers: the verified auth email is the booking email.
  if v_auth_uid is not null then
    select nullif(lower(btrim(u.email)), '')
    into v_auth_email
    from auth.users u
    where u.id = v_auth_uid;

    if v_auth_email is not null then
      v_email := v_auth_email;
    end if;
  end if;

  if v_email is not null and v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select
    v.organization_id,
    v.status,
    v.name,
    v.daily_rate,
    o.deposit_percent
  into
    v_organization_id,
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_deposit_percent
  from public.vehicles v
  inner join public.organizations o on o.id = v.organization_id
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
  for update of v;

  if v_organization_id is null then
    raise exception 'This vehicle is not available for online booking.'
      using errcode = 'P0002';
  end if;

  if v_vehicle_status in ('maintenance', 'inactive') then
    raise exception 'This vehicle is not available right now. Choose another car.'
      using errcode = 'P0001';
  end if;

  if v_daily_rate is null or v_daily_rate <= 0 then
    raise exception 'This vehicle does not have a rental rate yet. Please contact support.'
      using errcode = 'P0001';
  end if;

  v_days := greatest(
    1,
    (
      (timezone('Asia/Manila', p_expected_return_at))::date
      - (timezone('Asia/Manila', p_start_at))::date
    ) + 1
  );
  v_quoted_total := round(v_daily_rate * v_days, 2);
  v_deposit_amount := round(v_quoted_total * (v_deposit_percent / 100.0), 2);
  v_balance_due := round(v_quoted_total - v_deposit_amount, 2);

  select * into v_conflict
  from private.rental_schedule_conflict(
    v_organization_id,
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    null
  );

  if found then
    raise exception
      'Those dates are already booked for this car. Pick different dates or another vehicle.'
      using errcode = 'P0001';
  end if;

  select c.*
  into v_existing
  from public.customers c
  where c.organization_id = v_organization_id
    and (
      (v_email is not null and lower(btrim(coalesce(c.email, ''))) = v_email)
      or lower(btrim(c.drivers_license_number)) = lower(v_license)
      or btrim(c.phone_number) = v_phone
    )
  order by
    case
      when v_email is not null
        and lower(btrim(coalesce(c.email, ''))) = v_email then 0
      else 1
    end,
    c.created_at asc
  limit 1
  for update;

  if v_existing.id is null then
    insert into public.customers (
      organization_id,
      full_name,
      phone_number,
      email,
      drivers_license_number,
      notes
    )
    values (
      v_organization_id,
      v_full_name,
      v_phone,
      v_email,
      v_license,
      'Created from public web booking'
    )
    returning id into v_customer_id;
  else
    v_customer_id := v_existing.id;

    if v_existing.is_blocked then
      raise exception 'Your customer profile cannot book right now. Please contact support.'
        using errcode = 'P0001';
    end if;

    -- Never rewrite the matched customer's identity from an unauthenticated
    -- payload. Record any differences on the rental for staff to reconcile.
    if lower(btrim(v_existing.full_name)) is distinct from lower(v_full_name)
      or btrim(v_existing.phone_number) is distinct from v_phone
      or (
        v_email is not null
        and nullif(lower(btrim(coalesce(v_existing.email, ''))), '') is distinct from v_email
      )
      or lower(btrim(v_existing.drivers_license_number)) is distinct from lower(v_license)
    then
      v_contact_note :=
        'Contact details supplied at booking (differ from customer record; not applied): '
        || 'name: ' || v_full_name
        || '; phone: ' || v_phone
        || '; email: ' || coalesce(v_email, '(none)')
        || '; license: ' || v_license;
    end if;
  end if;

  if exists (
    select 1
    from public.customers c
    where c.id = v_customer_id
      and c.organization_id = v_organization_id
      and c.is_blocked
  ) then
    raise exception 'Your account cannot place bookings. Please contact support.'
      using errcode = 'P0001';
  end if;

  v_rental_notes := coalesce(v_notes, 'Booked online by customer — awaiting deposit');
  if v_contact_note is not null then
    v_rental_notes := v_rental_notes || E'\n' || v_contact_note;
  end if;

  v_reference :=
    'WEB-'
    || to_char(timezone('Asia/Manila', now()), 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.rentals (
    organization_id,
    reference_number,
    customer_id,
    vehicle_id,
    start_at,
    expected_return_at,
    pickup_location,
    return_location,
    status,
    notes,
    quoted_daily_rate,
    quoted_days,
    quoted_total,
    deposit_percent,
    deposit_amount,
    balance_due,
    payment_status,
    booking_source
  )
  values (
    v_organization_id,
    v_reference,
    v_customer_id,
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    v_pickup,
    coalesce(v_return, v_pickup),
    'draft',
    v_rental_notes,
    v_daily_rate,
    v_days,
    v_quoted_total,
    v_deposit_percent,
    v_deposit_amount,
    v_balance_due,
    'unpaid',
    'public_web'
  )
  returning id into v_rental_id;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'reference_number', v_reference,
    'vehicle_id', p_vehicle_id,
    'vehicle_name', v_vehicle_name,
    'start_at', p_start_at,
    'expected_return_at', p_expected_return_at,
    'quoted_daily_rate', v_daily_rate,
    'quoted_days', v_days,
    'quoted_total', v_quoted_total,
    'deposit_percent', v_deposit_percent,
    'deposit_amount', v_deposit_amount,
    'balance_due', v_balance_due,
    'payment_status', 'unpaid',
    'message', 'Booking received. Pay the deposit and upload your proof to confirm.'
  );
exception
  when exclusion_violation then
    raise exception
      'Those dates are already booked for this car. Pick different dates or another vehicle.'
      using errcode = 'P0001';
end;
$$;

revoke all on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text
) to anon, authenticated;

comment on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text
) is
  'Creates a draft public_web booking. Reuses a matched customer without rewriting its identity; differing contact details go to the rental notes.';
