-- Vehicle status is operational only (available / maintenance / inactive).
-- Reservation and rental occupancy come from rentals date ranges, not vehicles.status.
-- reserved / rented enum values remain for backward compatibility but are unused.

-- 1) Stop syncing vehicle status from rental workflow.
drop trigger if exists rentals_sync_vehicle_status on public.rentals;

comment on function private.sync_vehicle_status_from_rental() is
  'Deprecated: vehicle status is no longer synced from rentals. Occupancy is date-based.';

-- 2) Backfill schedule-derived vehicle statuses to available.
update public.vehicles
set status = 'available'
where status in ('reserved', 'rented');

-- 3) Relax guard: schedule conflicts are enforced on rentals, not vehicle.status.
-- Keep maintenance/inactive as manual ops states; do not block marking available.
create or replace function private.guard_vehicle_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Operational statuses only. Schedule occupancy lives on rentals.
  if new.status in ('reserved', 'rented') then
    raise exception
      'Vehicle status % is no longer used. Use available, maintenance, or inactive. Bookings are date-based.'
      , new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function private.guard_vehicle_availability() is
  'Rejects deprecated reserved/rented vehicle statuses. Booking availability is date-based.';

-- 4) Availability helper: block maintenance/inactive; conflicts by rental dates.
create or replace function public.check_vehicle_availability(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_exclude_rental_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_vehicle_status public.vehicle_status;
  v_conflict record;
begin
  if v_organization_id is null then
    raise exception 'Authentication is required.' using errcode = 'insufficient_privilege';
  end if;

  if p_expected_return_at <= p_start_at then
    return jsonb_build_object(
      'available', false,
      'reason', 'Expected return must be after the rental start.'
    );
  end if;

  select v.status into v_vehicle_status
  from public.vehicles v
  where v.organization_id = v_organization_id and v.id = p_vehicle_id;

  if v_vehicle_status is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'Vehicle was not found in your organization.'
    );
  end if;

  if v_vehicle_status in ('maintenance', 'inactive') then
    return jsonb_build_object(
      'available', false,
      'reason', format('Vehicle is %s and cannot be booked.', v_vehicle_status),
      'vehicle_status', v_vehicle_status
    );
  end if;

  select * into v_conflict
  from private.rental_schedule_conflict(
    v_organization_id,
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    p_exclude_rental_id
  );

  if found then
    return jsonb_build_object(
      'available', false,
      'reason', format(
        'Vehicle is already booked (%s · %s) from %s to %s.',
        v_conflict.reference_number,
        v_conflict.status,
        v_conflict.start_at,
        v_conflict.expected_return_at
      ),
      'vehicle_status', v_vehicle_status,
      'conflict', jsonb_build_object(
        'id', v_conflict.rental_id,
        'reference_number', v_conflict.reference_number,
        'status', v_conflict.status,
        'start_at', v_conflict.start_at,
        'expected_return_at', v_conflict.expected_return_at
      )
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'vehicle_status', v_vehicle_status
  );
end;
$$;

comment on function public.check_vehicle_availability(uuid, timestamptz, timestamptz, uuid) is
  'Checks operational vehicle status and rental date-range conflicts.';

-- 5) Validate rental change: same schedule gates; never mutate vehicle status.
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
      or new.organization_id is distinct from old.organization_id
    ) then
      raise exception 'Customer, vehicle, and organization cannot change after a rental leaves draft.'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('reserved', 'active', 'cancelled'))
      or (old.status = 'reserved' and new.status in ('active', 'cancelled', 'overdue'))
      or (old.status = 'active' and new.status in ('completed', 'cancelled', 'overdue'))
      or (old.status = 'overdue' and new.status in ('completed', 'cancelled'))
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
    where v.organization_id = new.organization_id and v.id = new.vehicle_id
    for update;

    if v_vehicle_status is null then
      raise exception 'The selected vehicle was not found in this organization.'
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
    from private.rental_schedule_conflict(
      new.organization_id,
      new.vehicle_id,
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
    where c.organization_id = new.organization_id and c.id = new.customer_id
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

-- 6) Public fleet listing: operational available + optional date conflicts.
create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid,
  name text,
  make text,
  model text,
  year smallint,
  category text,
  transmission public.vehicle_transmission,
  fuel_type public.vehicle_fuel_type,
  seating_capacity smallint,
  photo_url text,
  daily_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.name,
    v.make,
    v.model,
    v.year,
    v.category,
    v.transmission,
    v.fuel_type,
    v.seating_capacity,
    v.photo_url,
    v.daily_rate
  from public.vehicles v
  inner join public.organizations o
    on o.id = v.organization_id
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
    and (
      p_start_date is null
      or p_end_date is null
      or p_end_date < p_start_date
      or not exists (
        select 1
        from public.rentals r
        where r.organization_id = v.organization_id
          and r.vehicle_id = v.id
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

comment on function public.list_public_available_vehicles(date, date) is
  'Public catalog of operationally available vehicles; optional dates exclude rental schedule conflicts.';

-- 7) Public booking: block maintenance/inactive only; conflicts by dates.
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
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone_number, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_license text := btrim(coalesce(p_drivers_license_number, ''));
  v_pickup text := nullif(btrim(coalesce(p_pickup_location, '')), '');
  v_return text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
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

  select c.id
  into v_customer_id
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

  if v_customer_id is null then
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
    update public.customers
    set
      full_name = v_full_name,
      phone_number = v_phone,
      email = coalesce(v_email, email),
      drivers_license_number = v_license
    where id = v_customer_id
      and organization_id = v_organization_id
      and is_blocked = false;

    if not found then
      raise exception 'Your customer profile cannot book right now. Please contact support.'
        using errcode = 'P0001';
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
    payment_status
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
    coalesce(v_notes, 'Booked online by customer — awaiting deposit'),
    v_daily_rate,
    v_days,
    v_quoted_total,
    v_deposit_percent,
    v_deposit_amount,
    v_balance_due,
    'unpaid'
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

comment on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text
) is
  'Creates a draft public booking; vehicle stays available; schedule conflicts are date-based.';

comment on type public.vehicle_status is
  'Operational vehicle status: available, maintenance, inactive. reserved/rented are deprecated; occupancy is rental date-based.';
