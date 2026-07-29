-- Strengthen rental booking gates: clear overlap checks, vehicle status locks,
-- and an availability helper for the app layer.

create or replace function private.rental_schedule_conflict(
  p_organization_id uuid,
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
  select
    r.id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at
  from public.rentals r
  where r.organization_id = p_organization_id
    and r.vehicle_id = p_vehicle_id
    and r.status in ('reserved', 'active', 'overdue')
    and (p_exclude_rental_id is null or r.id <> p_exclude_rental_id)
    and tstzrange(r.start_at, r.expected_return_at, '[)')
      && tstzrange(p_start_at, p_expected_return_at, '[)')
  order by r.start_at
  limit 1;
$$;

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

    -- Terminal rentals keep identity and schedule fixed; notes/odometer may still update.
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

revoke all on function private.rental_schedule_conflict(
  uuid, uuid, timestamptz, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function private.rental_schedule_conflict(
  uuid, uuid, timestamptz, timestamptz, uuid
) to postgres, service_role;

revoke all on function public.check_vehicle_availability(
  uuid, timestamptz, timestamptz, uuid
) from public, anon;

grant execute on function public.check_vehicle_availability(
  uuid, timestamptz, timestamptz, uuid
) to authenticated;
