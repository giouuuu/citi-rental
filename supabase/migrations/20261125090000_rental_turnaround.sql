-- ===========================================================================
-- Turnaround time between rentals, and part-free days stay bookable.
--
-- A car back at 7:00 AM needs time to be washed and checked before it goes
-- out again. Settings → turnaround (default 1 h 30 min) keeps that gap on
-- both sides of every booking: the next trip starts at 8:30 AM at the
-- earliest, and a trip must end 1 h 30 min before the car's next pick-up.
--
-- 1. company_profile.turnaround_minutes and private.turnaround().
-- 2. private.rental_schedule_conflict(…, p_turnaround): the overlap test with
--    the gap. The 4-argument form every caller uses (online booking, payment
--    proof, PayMongo, staff availability) now applies Settings' gap.
-- 3. validate_rental_change applies the gap when a booking is placed or
--    moved (new, new dates or car, a draft starting to hold its dates); a
--    status change on a booking already placed (reserved → active) is not
--    re-judged, so bookings made before this are never stuck.
-- 4. list_public_vehicle_booked_ranges returns each booking widened by the
--    gap: the times the car can't be handed over. The booking calendar shows
--    a return day as free from then instead of greying the whole day.
-- 5. list_public_available_vehicles (the landing's "free for these dates"):
--    a car busy for part of the pick-up or return day still shows; only a
--    car taken a whole day of the trip is left out. Otherwise as
--    20261120090000_vehicle_driving_mode_pricing.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column if not exists turnaround_minutes integer not null default 90
    check (turnaround_minutes between 0 and 1440);

comment on column public.company_profile.turnaround_minutes is
  'Minutes a car is kept free before and after every rental (washing, checks). 0: back-to-back.';

grant select (turnaround_minutes), update (turnaround_minutes)
  on public.company_profile to authenticated;

create or replace function private.turnaround()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select make_interval(mins => o.turnaround_minutes) from public.company_profile o limit 1),
    interval '0'
  );
$$;

revoke all on function private.turnaround() from public, anon;
grant execute on function private.turnaround() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The overlap test, with the gap
-- ---------------------------------------------------------------------------
create or replace function private.rental_schedule_conflict(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_exclude_rental_id uuid,
  p_turnaround interval
)
returns table (
  rental_id uuid,
  reference_number text,
  status public.rental_status,
  start_at timestamptz,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at
  from public.rentals r
  where r.vehicle_id = p_vehicle_id
    and private.rental_holds_dates(r.status, r.payment_status)
    and (p_exclude_rental_id is null or r.id <> p_exclude_rental_id)
    -- Each side keeps the gap after its return: the new trip can't start
    -- before this one is back and turned around, nor end too close to it.
    and tstzrange(r.start_at, r.expected_return_at + coalesce(p_turnaround, interval '0'), '[)')
      && tstzrange(p_start_at, p_expected_return_at + coalesce(p_turnaround, interval '0'), '[)')
  order by r.start_at
  limit 1;
$$;

revoke all on function private.rental_schedule_conflict(uuid, timestamptz, timestamptz, uuid, interval)
  from public, anon;
grant execute on function private.rental_schedule_conflict(uuid, timestamptz, timestamptz, uuid, interval)
  to authenticated, service_role;

create or replace function private.rental_schedule_conflict(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_exclude_rental_id uuid default null
)
returns table (
  rental_id uuid,
  reference_number text,
  status public.rental_status,
  start_at timestamptz,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from private.rental_schedule_conflict(
    p_vehicle_id, p_start_at, p_expected_return_at, p_exclude_rental_id,
    private.turnaround()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Staff edits: the gap when a booking is placed or moved
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
  v_check_clash boolean;
  v_placed boolean;
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

    -- Placed or moved: new, other dates or car, or starting to hold its dates.
    v_placed := tg_op = 'INSERT';
    if not v_placed then
      v_placed :=
        new.vehicle_id is distinct from old.vehicle_id
        or new.start_at is distinct from old.start_at
        or new.expected_return_at is distinct from old.expected_return_at
        or (
          private.rental_holds_dates(new.status, new.payment_status)
          and not private.rental_holds_dates(old.status, old.payment_status)
        );
    end if;
    v_check_clash := v_placed or (tg_op = 'UPDATE' and new.status is distinct from old.status);

    if v_check_clash then
      select * into v_conflict
      from private.rental_schedule_conflict(new.vehicle_id,
        new.start_at,
        new.expected_return_at,
        case when tg_op = 'UPDATE' then new.id else null end,
        case when v_placed then private.turnaround() else interval '0' end
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

-- ---------------------------------------------------------------------------
-- 4. The booking calendar's taken times, widened by the gap
-- ---------------------------------------------------------------------------
create or replace function public.list_public_vehicle_booked_ranges(p_vehicle_id uuid)
returns table (start_at timestamptz, expected_return_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.start_at - private.turnaround(), r.expected_return_at + private.turnaround()
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.vehicle_id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive'
    and private.rental_holds_dates(r.status, r.payment_status)
    and r.expected_return_at + private.turnaround() > now()
  order by r.start_at asc;
$$;

-- ---------------------------------------------------------------------------
-- 5. "Free for these dates" on the landing: part-free end days count
-- ---------------------------------------------------------------------------
create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric,
  color text, showcase_image_url text, half_day_rate numeric, hourly_rate numeric,
  slug text, with_driver_daily_rate numeric, booking_charges jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate,
    v.color, v.showcase_image_url, v.half_day_rate, v.hourly_rate, v.slug,
    v.with_driver_daily_rate, private.vehicle_public_booking_charges(v.id)
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
        cross join lateral (
          select
            r.start_at - private.turnaround() as taken_from,
            r.expected_return_at + private.turnaround() as taken_until,
            (p_start_date::timestamp at time zone 'Asia/Manila') as pickup_day,
            (p_end_date::timestamp at time zone 'Asia/Manila') as return_day
        ) t
        where r.vehicle_id = v.id
          and private.rental_holds_dates(r.status, r.payment_status)
          and (
            -- Taken during a whole day between pick-up and return day.
            tstzrange(t.taken_from, t.taken_until, '[)')
              && tstzrange(
                t.pickup_day + interval '1 day',
                greatest(t.return_day, t.pickup_day + interval '1 day'),
                '[)'
              )
            -- Or taken all of the pick-up day, or all of the return day.
            or (t.taken_from <= t.pickup_day and t.taken_until >= t.pickup_day + interval '1 day')
            or (t.taken_from <= t.return_day and t.taken_until >= t.return_day + interval '1 day')
          )
      )
    )
  order by v.name asc, v.created_at asc;
$$;
