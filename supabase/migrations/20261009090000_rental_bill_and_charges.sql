-- ===========================================================================
-- Rental bill: manual rate, charges, and extensions.
--
-- 1. Photos no longer gate `available`. A car without its 6-photo gallery can
--    be rented from the ops app; the gallery now decides only whether the car
--    is shown and bookable on the public site.
-- 2. Ops rentals keep their balance in step with their quote. Staff enter a
--    daily rate on the rental form; the app writes quoted_daily_rate,
--    quoted_days and quoted_total, and this trigger refreshes balance_due.
-- 3. Charge types (Car wash, Delivery, Extension, Fuel shortage, Damage,
--    Other income) are a list owners and admins maintain in Settings.
-- 4. A charge is a confirmed `penalty` row on the payments ledger tagged with
--    its charge type. Inspection fuel and damage charges were already penalty
--    rows; the balance (refresh_rental_payment_summary), analytics
--    outstanding, and the finance statement's "billed" line all count them
--    already, so a charge needs no new money math anywhere.
-- 5. extend_rental moves the return date of an active or overdue rental,
--    blocks on the next booking, and optionally adds an Extension charge.
-- 6. Fixes record_rental_payment, which failed on every call (enum cast).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Photos gate the public site, not the `available` status
-- ---------------------------------------------------------------------------
drop trigger if exists vehicles_require_gallery_when_available on public.vehicles;
drop function if exists private.enforce_vehicle_gallery_for_available();

comment on table public.vehicle_photos is
  'Fleet gallery slots: front, rear, left, right, interior, dashboard. All 6 are required before a car shows on the public site.';

create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric,
  color text, showcase_image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate,
    v.color, v.showcase_image_url
  from public.vehicles v
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
    and public.vehicle_has_required_gallery(v.id)
    and (
      p_start_date is null
      or p_end_date is null
      or p_end_date < p_start_date
      or not exists (
        select 1
        from public.rentals r
        where r.vehicle_id = v.id
          and r.status in ('reserved', 'active', 'overdue')
          and tstzrange(r.start_at, r.expected_return_at, '[)')
            && tstzrange(
              (p_start_date::timestamp at time zone 'Asia/Manila'),
              ((p_end_date + 1)::timestamp at time zone 'Asia/Manila'),
              '[)'
            )
      )
    )
  order by v.name asc, v.created_at asc;
$$;

-- A car still missing photos reads as maintenance on its public page, so a
-- shared link shows "not available" instead of a car with no pictures.
create or replace function public.get_public_vehicle(p_vehicle_id uuid)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, status public.vehicle_status,
  daily_rate numeric, color text, showcase_image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category, v.transmission,
    v.fuel_type, v.seating_capacity, v.photo_url,
    case
      when v.status = 'available' and not public.vehicle_has_required_gallery(v.id)
        then 'maintenance'::public.vehicle_status
      else v.status
    end,
    v.daily_rate, v.color, v.showcase_image_url
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

-- Online bookings still need the full gallery, whatever path reaches the insert.
create or replace function private.require_gallery_for_public_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vehicle_has_required_gallery(new.vehicle_id) then
    raise exception 'This car is not open for online booking yet. Please choose another car.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists rentals_public_booking_requires_gallery on public.rentals;
create trigger rentals_public_booking_requires_gallery
before insert on public.rentals
for each row
when (new.booking_source = 'public_web')
execute function private.require_gallery_for_public_booking();

-- ---------------------------------------------------------------------------
-- 2. Ops rentals: balance follows the quote
--    Online bookings are left alone: create_public_booking writes its own
--    balance (quote minus the expected deposit) and payments refresh it.
-- ---------------------------------------------------------------------------
create or replace function private.refresh_ops_rental_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_rental_payment_summary(new.id);
  return null;
end;
$$;

drop trigger if exists rentals_refresh_ops_balance on public.rentals;
create trigger rentals_refresh_ops_balance
after insert or update of quoted_total on public.rentals
for each row
when (new.booking_source = 'ops')
execute function private.refresh_ops_rental_balance();

-- ---------------------------------------------------------------------------
-- 3. Charge types
-- ---------------------------------------------------------------------------
create table public.rental_charge_types (
  id uuid primary key default gen_random_uuid(),
  -- Set on the built-in types the database itself posts (inspection fuel and
  -- damage, extensions). Never edited from the app.
  code text unique check (code is null or code ~ '^[a-z_]{2,40}$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  -- Pre-fills the amount when staff add the charge. Null means type it each time.
  default_amount numeric(12, 2) check (default_amount is null or default_amount >= 0),
  is_active boolean not null default true,
  sort_order smallint not null default 100 check (sort_order between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index rental_charge_types_one_active_name
  on public.rental_charge_types (lower(trim(name))) where is_active;

create trigger rental_charge_types_set_updated_at
before update on public.rental_charge_types
for each row execute function private.set_updated_at();

comment on table public.rental_charge_types is
  'Fees staff add to a rental bill (car wash, delivery, extension, other income). Owners and admins maintain the list.';

alter table public.rental_charge_types enable row level security;

revoke all on table public.rental_charge_types from anon, authenticated;
grant select, insert, update on table public.rental_charge_types to authenticated;
grant all on table public.rental_charge_types to service_role;

create policy rental_charge_types_select_staff
on public.rental_charge_types for select to authenticated
using ((select private.is_org_staff()));

create policy rental_charge_types_insert_admin
on public.rental_charge_types for insert to authenticated
with check ((select private.is_org_admin()));

create policy rental_charge_types_update_admin
on public.rental_charge_types for update to authenticated
using ((select private.is_org_admin()))
with check ((select private.is_org_admin()));

insert into public.rental_charge_types (code, name, sort_order) values
  ('car_wash', 'Car wash', 10),
  ('delivery', 'Delivery', 20),
  ('extension', 'Extension', 30),
  ('fuel_shortage', 'Fuel shortage', 40),
  ('damage', 'Damage', 50),
  ('other_income', 'Other income', 60)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Charges on the payments ledger
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists charge_type_id uuid
    references public.rental_charge_types (id) on delete restrict;

alter table public.payments
  drop constraint if exists payments_charge_type_only_on_charges;
alter table public.payments
  add constraint payments_charge_type_only_on_charges
  check (charge_type_id is null or payment_type = 'penalty');

create index if not exists payments_charge_type_id_idx
  on public.payments (charge_type_id) where charge_type_id is not null;

comment on column public.payments.charge_type_id is
  'For penalty rows (charges on the bill): which charge type. Null on older rows and on money received.';

-- Tag the fuel and damage charges a return inspection posts, so they appear
-- on the bill under their type. submit_rental_inspection links each charge
-- after inserting it; tagging here avoids re-creating that function.
create or replace function private.tag_inspection_charges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fuel_payment_id is not null
    and new.fuel_payment_id is distinct from old.fuel_payment_id then
    update public.payments
    set charge_type_id = (
      select ct.id from public.rental_charge_types ct where ct.code = 'fuel_shortage'
    )
    where id = new.fuel_payment_id
      and charge_type_id is null;
  end if;

  if new.damage_payment_id is not null
    and new.damage_payment_id is distinct from old.damage_payment_id then
    update public.payments
    set charge_type_id = (
      select ct.id from public.rental_charge_types ct where ct.code = 'damage'
    )
    where id = new.damage_payment_id
      and charge_type_id is null;
  end if;

  return null;
end;
$$;

drop trigger if exists rental_inspections_tag_charges on public.rental_inspections;
create trigger rental_inspections_tag_charges
after update of fuel_payment_id, damage_payment_id on public.rental_inspections
for each row
execute function private.tag_inspection_charges();

create or replace function public.add_rental_charge(
  p_rental_id uuid,
  p_charge_type_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.rental_status;
  v_type_active boolean;
  v_payment_id uuid;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required to add charges.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select ct.is_active into v_type_active
  from public.rental_charge_types ct
  where ct.id = p_charge_type_id;
  if not found then
    raise exception 'Choose a charge type.' using errcode = '22023';
  end if;
  if not v_type_active then
    raise exception 'That charge type is archived. Choose another.' using errcode = '22023';
  end if;

  select r.status into v_status
  from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cancelled rentals cannot take new charges.' using errcode = 'check_violation';
  end if;

  insert into public.payments (
    rental_id, payment_type, charge_type_id, amount, currency, method,
    status, notes, submitted_at, confirmed_at, confirmed_by
  )
  values (
    p_rental_id, 'penalty', p_charge_type_id, round(p_amount, 2), 'PHP', null,
    'confirmed', nullif(btrim(coalesce(p_notes, '')), ''), now(), now(), v_user_id
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(p_rental_id);
  return v_payment_id;
end;
$$;

create or replace function public.void_rental_charge(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental_id uuid;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can remove charges.' using errcode = '42501';
  end if;

  update public.payments p
  set status = 'cancelled'
  where p.id = p_payment_id
    and p.payment_type = 'penalty'
    and p.status = 'confirmed'
  returning p.rental_id into v_rental_id;

  if v_rental_id is null then
    raise exception 'That charge was not found or is already removed.' using errcode = 'P0002';
  end if;

  perform private.refresh_rental_payment_summary(v_rental_id);
end;
$$;

revoke all on function public.add_rental_charge(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.add_rental_charge(uuid, uuid, numeric, text) to authenticated, service_role;
revoke all on function public.void_rental_charge(uuid) from public, anon;
grant execute on function public.void_rental_charge(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Extensions
--    An overdue rental extended into the future goes back to active, so the
--    status trigger gains overdue -> active (only with a future return).
-- ---------------------------------------------------------------------------
create or replace function private.validate_rental_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_blocked boolean;
  v_customer_consent timestamptz;
  v_vehicle_status public.vehicle_status;
  v_conflict record;
begin
  if new.expected_return_at <= new.start_at then
    raise exception 'Expected return must be after the rental start.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
    ) then
      raise exception 'Customer and vehicle cannot change after a rental leaves draft.'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('reserved', 'active', 'cancelled'))
      or (old.status = 'reserved' and new.status in ('active', 'cancelled', 'overdue'))
      or (old.status = 'active' and new.status in ('completed', 'cancelled', 'overdue'))
      or (old.status = 'overdue' and new.status in ('completed', 'cancelled'))
      or (old.status = 'overdue' and new.status = 'active' and new.expected_return_at > now())
    ) then
      raise exception 'Invalid rental status transition from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if old.status in ('completed', 'cancelled') and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.start_at is distinct from old.start_at
      or new.expected_return_at is distinct from old.expected_return_at
      or new.status is distinct from old.status
    ) then
      raise exception 'Completed or cancelled rentals cannot change vehicle, customer, schedule, or status.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Lock the vehicle row so concurrent booking attempts serialize on the same car.
  if new.status in ('draft', 'reserved', 'active', 'overdue') then
    select v.status into v_vehicle_status
    from public.vehicles v
    where v.id = new.vehicle_id
    for update;

    if v_vehicle_status is null then
      raise exception 'The selected vehicle was not found.'
        using errcode = 'foreign_key_violation';
    end if;

    if v_vehicle_status in ('maintenance', 'inactive') then
      raise exception
        'Vehicle is % and cannot be booked. Choose an available vehicle.',
        v_vehicle_status
        using errcode = 'check_violation';
    end if;

    -- Treat legacy reserved/rented vehicle rows as bookable (schedule is source of truth).
    -- New writes of those statuses are blocked by guard_vehicle_availability.

    select * into v_conflict
    from private.rental_schedule_conflict(new.vehicle_id,
      new.start_at,
      new.expected_return_at,
      case when tg_op = 'UPDATE' then new.id else null end
    );

    if found then
      raise exception
        'This vehicle is already booked (% · %) from % to %. Pick another car or different dates.',
        v_conflict.reference_number,
        v_conflict.status,
        v_conflict.start_at,
        v_conflict.expected_return_at
        using errcode = 'exclusion_violation';
    end if;
  end if;

  if new.status in ('reserved', 'active', 'overdue') then
    select c.is_blocked, c.tracking_consent_at
      into v_customer_blocked, v_customer_consent
    from public.customers c
    where c.id = new.customer_id
    for update;

    if coalesce(v_customer_blocked, true) then
      raise exception 'Blocked customers cannot reserve or start rentals.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status in ('active', 'overdue')
    and coalesce(new.tracking_consent_at, v_customer_consent) is null then
    raise exception 'GPS tracking consent is required before a rental can start.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'completed' and new.actual_return_at is null then
    new.actual_return_at := now();
  end if;
  if new.status <> 'completed' and new.ending_odometer is not null then
    raise exception 'Ending odometer may only be recorded for a completed rental.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.extend_rental(
  p_rental_id uuid,
  p_new_return_at timestamptz,
  p_charge_amount numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rental public.rentals%rowtype;
  v_charge_type_id uuid;
  v_payment_id uuid;
  v_note text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required to extend rentals.' using errcode = '42501';
  end if;
  if p_new_return_at is null then
    raise exception 'Choose the new return date and time.' using errcode = '22023';
  end if;
  if p_charge_amount is not null and p_charge_amount < 0 then
    raise exception 'The extension charge cannot be negative.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select * into v_rental
  from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;
  if v_rental.status not in ('active', 'overdue') then
    raise exception 'Only active or overdue rentals can be extended. Edit the dates of a rental that has not started yet.'
      using errcode = 'check_violation';
  end if;
  if p_new_return_at <= v_rental.expected_return_at then
    raise exception 'The new return must be later than the current one.'
      using errcode = 'check_violation';
  end if;

  -- validate_rental_change blocks the move if it runs into the next booking.
  update public.rentals
  set
    expected_return_at = p_new_return_at,
    status = case
      when status = 'overdue' and p_new_return_at > now() then 'active'::public.rental_status
      else status
    end
  where id = p_rental_id;

  if coalesce(p_charge_amount, 0) > 0 then
    select ct.id into v_charge_type_id
    from public.rental_charge_types ct
    where ct.code = 'extension';

    insert into public.payments (
      rental_id, payment_type, charge_type_id, amount, currency, method,
      status, notes, submitted_at, confirmed_at, confirmed_by
    )
    values (
      p_rental_id, 'penalty', v_charge_type_id, round(p_charge_amount, 2), 'PHP', null,
      'confirmed',
      'Extended to '
        || to_char(p_new_return_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY FMHH12:MI AM')
        || coalesce(' · ' || v_note, ''),
      now(), now(), v_user_id
    )
    returning id into v_payment_id;
  end if;

  perform private.refresh_rental_payment_summary(p_rental_id);

  return jsonb_build_object(
    'success', true,
    'rental_id', p_rental_id,
    'payment_id', v_payment_id
  );
end;
$$;

revoke all on function public.extend_rental(uuid, timestamptz, numeric, text) from public, anon;
grant execute on function public.extend_rental(uuid, timestamptz, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Fix record_rental_payment: the status CASE resolved to text, and text
--    does not assign to payment_entry_status, so every staff-recorded payment
--    failed with "column status is of type payment_entry_status but expression
--    is of type text". Same body, with the enum cast.
-- ---------------------------------------------------------------------------
create or replace function public.record_rental_payment(
  p_rental_id uuid,
  p_payment_type public.payment_type,
  p_amount numeric,
  p_method text default 'cash',
  p_external_reference text default null,
  p_notes text default null,
  p_confirm boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_payment_id uuid;
  v_method text := nullif(lower(btrim(coalesce(p_method, ''))), '');
  v_ref text := nullif(btrim(coalesce(p_external_reference, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to record payments.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;
  if p_payment_type is null then
    raise exception 'Select a payment type.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if v_method is not null
    and v_method not in ('gcash', 'maya', 'bank', 'cash', 'other') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;

  select r.id into v_rental_id
  from public.rentals r
  where r.id = p_rental_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  insert into public.payments (
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    notes,
    submitted_at,
    confirmed_at,
    confirmed_by
  )
  values (
    v_rental_id,
    p_payment_type,
    round(p_amount, 2),
    'PHP',
    v_method,
    (case when p_confirm then 'confirmed' else 'submitted' end)::public.payment_entry_status,
    v_ref,
    coalesce(v_notes, 'Recorded by staff'),
    now(),
    case when p_confirm then now() else null end,
    case when p_confirm then v_user_id else null end
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(v_rental_id);

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'rental_id', v_rental_id,
    'message', 'Payment recorded.'
  );
end;
$$;
