-- Public customer booking: guests can reserve an available fleet vehicle.
-- Creates/reuses a customers row and inserts a reserved rental via security definer.

create or replace function public.get_public_vehicle(p_vehicle_id uuid)
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
  status public.vehicle_status
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
    v.status
  from public.vehicles v
  inner join public.organizations o on o.id = v.organization_id
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

revoke all on function public.get_public_vehicle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_vehicle(uuid)
  to anon, authenticated;

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
  if v_email is not null and v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select v.organization_id, v.status
  into v_organization_id, v_vehicle_status
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
      lower(btrim(c.drivers_license_number)) = lower(v_license)
      or btrim(c.phone_number) = v_phone
    )
  order by c.created_at asc
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
    notes
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
    'reserved',
    coalesce(v_notes, 'Booked online by customer')
  )
  returning id into v_rental_id;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'reference_number', v_reference,
    'vehicle_id', p_vehicle_id,
    'start_at', p_start_at,
    'expected_return_at', p_expected_return_at,
    'message', 'Your booking is reserved. Our team will confirm the details shortly.'
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
  'Creates a reserved rental for a public-site vehicle and upserts the customer record.';
comment on function public.get_public_vehicle(uuid) is
  'Returns a single public-site vehicle for the booking page.';
