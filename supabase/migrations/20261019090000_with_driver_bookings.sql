-- ===========================================================================
-- With-driver bookings.
--
-- Customers choose self-drive or with driver when they book. A driver is
-- charged at one flat daily rate the owner sets in Settings, for every started
-- 24 hours of the trip, and saved on the rental as its own line so the bill
-- can show it. The fee is part of quoted_total, so the reservation fee cap,
-- balance, bill and revenue reports include it with no other change.
--
-- 1. company_profile.driver_daily_rate, and get_public_driver_daily_rate for
--    the booking quote.
-- 2. rentals.with_driver / driver_daily_rate / driver_days / driver_fee.
-- 3. private.rental_driver_days: the driver's billed days for a trip.
-- 4. create_public_booking takes p_with_driver and prices the driver.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The driver rate on the company profile
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column driver_daily_rate numeric(12, 2)
    check (driver_daily_rate is null or driver_daily_rate >= 0);

comment on column public.company_profile.driver_daily_rate is
  'Flat amount (PHP) per day added to a with-driver booking. Null: staff quote the driver.';

grant select (driver_daily_rate), update (driver_daily_rate)
  on public.company_profile to authenticated;

create function public.get_public_driver_daily_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select c.driver_daily_rate from public.company_profile c limit 1;
$$;

revoke all on function public.get_public_driver_daily_rate()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_driver_daily_rate()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The driver on the rental
-- ---------------------------------------------------------------------------
alter table public.rentals
  add column with_driver boolean not null default false,
  add column driver_daily_rate numeric(12, 2)
    check (driver_daily_rate is null or driver_daily_rate >= 0),
  add column driver_days integer check (driver_days is null or driver_days >= 0),
  add column driver_fee numeric(12, 2) not null default 0
    check (driver_fee >= 0);

comment on column public.rentals.with_driver is
  'The customer asked for a driver when booking.';
comment on column public.rentals.driver_fee is
  'Driver charge included in quoted_total: driver_daily_rate x driver_days.';

-- ---------------------------------------------------------------------------
-- 3. Driver days: every started 24 hours, at least one
-- ---------------------------------------------------------------------------
create function private.rental_driver_days(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    1,
    ceil(extract(epoch from (p_end_at - p_start_at)) / 86400.0)
  )::integer;
$$;

-- ---------------------------------------------------------------------------
-- 4. Online bookings price the driver
-- ---------------------------------------------------------------------------
drop function if exists public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text
);

create function public.create_public_booking(
  p_vehicle_id uuid,
  p_start_at timestamp with time zone,
  p_expected_return_at timestamp with time zone,
  p_full_name text,
  p_phone_number text,
  p_email text,
  p_drivers_license_number text,
  p_pickup_location text default null::text,
  p_return_location text default null::text,
  p_notes text default null::text,
  p_address text default null::text,
  p_facebook_account text default null::text,
  p_destination text default null::text,
  p_passenger_count integer default null,
  p_license_selfie_path text default null::text,
  p_government_id_path text default null::text,
  p_with_driver boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_vehicle_status public.vehicle_status;
  v_vehicle_name text;
  v_daily_rate numeric(12, 2);
  v_half_day_rate numeric(12, 2);
  v_hourly_rate numeric(12, 2);
  v_hours integer;
  v_seats integer;
  v_reservation_fee numeric(12, 2);
  v_with_driver boolean := coalesce(p_with_driver, false);
  v_driver_rate numeric(12, 2);
  v_driver_days integer;
  v_driver_fee numeric(12, 2) := 0;
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
  v_phone_key text := private.normalize_phone(p_phone_number);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_license text := btrim(coalesce(p_drivers_license_number, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_facebook text := btrim(coalesce(p_facebook_account, ''));
  v_pickup text := nullif(btrim(coalesce(p_pickup_location, '')), '');
  v_return text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_destination text := nullif(btrim(coalesce(p_destination, '')), '');
  v_selfie text := nullif(btrim(coalesce(p_license_selfie_path, '')), '');
  v_gov_id text := nullif(btrim(coalesce(p_government_id_path, '')), '');
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

  -- Trip details are required for every booking, new or returning.
  if v_pickup is null or char_length(v_pickup) > 200 then
    raise exception 'Enter the pick-up or delivery location.' using errcode = '22023';
  end if;
  if v_return is null or char_length(v_return) > 200 then
    raise exception 'Enter the return location.' using errcode = '22023';
  end if;
  if v_destination is null or char_length(v_destination) > 200 then
    raise exception 'Enter your destination.' using errcode = '22023';
  end if;
  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 60 then
    raise exception 'Enter how many passengers.' using errcode = '22023';
  end if;

  -- Both ID photos must be objects the guest just uploaded to booking-ids,
  -- in one fresh folder no other rental has used.
  if v_selfie is null
    or v_selfie !~ '^[0-9a-f-]{36}/license-selfie\.(jpg|png|webp|gif)$'
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'booking-ids' and o.name = v_selfie
    )
  then
    raise exception 'Upload a selfie holding your driver''s license.' using errcode = '22023';
  end if;
  if v_gov_id is null
    or v_gov_id !~ '^[0-9a-f-]{36}/government-id\.(jpg|png|webp|gif)$'
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'booking-ids' and o.name = v_gov_id
    )
  then
    raise exception 'Upload a photo of another government ID.' using errcode = '22023';
  end if;
  if split_part(v_selfie, '/', 1) <> split_part(v_gov_id, '/', 1)
    or exists (
      select 1 from public.rentals r
      where split_part(r.renter_license_selfie_path, '/', 1) = split_part(v_selfie, '/', 1)
         or split_part(r.renter_government_id_path, '/', 1) = split_part(v_selfie, '/', 1)
    )
  then
    raise exception 'Upload your ID photos again.' using errcode = '22023';
  end if;

  -- Identity fields may be blank for a returning customer; anything supplied
  -- must still be well-formed.
  if v_full_name <> '' and char_length(v_full_name) not between 2 and 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;
  if v_phone <> '' and char_length(v_phone) not between 7 and 40 then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if v_license <> '' and char_length(v_license) not between 3 and 80 then
    raise exception 'Enter your driver license number.' using errcode = '22023';
  end if;
  if v_address <> '' and char_length(v_address) not between 5 and 300 then
    raise exception 'Enter your complete address.' using errcode = '22023';
  end if;
  if v_facebook <> '' and char_length(v_facebook) not between 2 and 200 then
    raise exception 'Enter your Facebook name or profile link.' using errcode = '22023';
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
    v.status,
    v.name,
    v.daily_rate,
    v.half_day_rate,
    v.hourly_rate,
    v.seating_capacity,
    o.reservation_fee,
    o.driver_daily_rate
  into
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_half_day_rate,
    v_hourly_rate,
    v_seats,
    v_reservation_fee,
    v_driver_rate
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
  for update of v;

  if v_vehicle_status is null then
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

  if v_seats is not null and p_passenger_count > v_seats then
    raise exception 'This car seats % passengers. Choose a bigger car or fewer passengers.', v_seats
      using errcode = '22023';
  end if;
  -- The driver takes one of the seats.
  if v_with_driver and v_seats is not null and p_passenger_count > v_seats - 1 then
    raise exception 'With a driver, this car seats % passengers. Choose a bigger car or fewer passengers.', v_seats - 1
      using errcode = '22023';
  end if;

  select q.days, q.hours, q.total
  into v_days, v_hours, v_quoted_total
  from private.rental_rent_quote(
    p_start_at, p_expected_return_at, v_daily_rate, v_half_day_rate, v_hourly_rate
  ) q;
  -- With a driver: the driver's day rate for every started 24 hours, added to
  -- the trip so the deposit, balance and bill all include it. No rate set in
  -- Settings means staff quote the driver when they confirm.
  if v_with_driver then
    v_driver_days := private.rental_driver_days(p_start_at, p_expected_return_at);
    v_driver_fee := round(coalesce(v_driver_rate, 0) * v_driver_days, 2);
    v_quoted_total := v_quoted_total + v_driver_fee;
  end if;
  -- A flat reservation fee, never more than the trip itself.
  v_deposit_amount := least(v_reservation_fee, v_quoted_total);
  v_balance_due := round(v_quoted_total - v_deposit_amount, 2);

  select * into v_conflict
  from private.rental_schedule_conflict(
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
  where (
      (v_email is not null and lower(btrim(coalesce(c.email, ''))) = v_email)
      or (v_license <> '' and lower(btrim(c.drivers_license_number)) = lower(v_license))
      or (v_phone_key is not null and private.normalize_phone(c.phone_number) = v_phone_key)
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
    if v_full_name = '' then
      raise exception 'Enter your full name.' using errcode = '22023';
    end if;
    if v_phone = '' then
      raise exception 'Enter a valid phone number.' using errcode = '22023';
    end if;
    if v_license = '' then
      raise exception 'Enter your driver license number.' using errcode = '22023';
    end if;
    if v_address = '' then
      raise exception 'Enter your complete address.' using errcode = '22023';
    end if;
    if v_facebook = '' then
      raise exception 'Enter your Facebook name or profile link.' using errcode = '22023';
    end if;

    insert into public.customers (
      full_name,
      phone_number,
      email,
      drivers_license_number,
      address,
      facebook_profile_url,
      notes
    )
    values (
      v_full_name,
      v_phone,
      v_email,
      v_license,
      v_address,
      v_facebook,
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
    -- payload. Record any supplied differences on the rental for staff to
    -- reconcile; omitted fields fall back to the record and are not differences.
    if (v_full_name <> '' and lower(btrim(v_existing.full_name)) is distinct from lower(v_full_name))
      or (v_phone_key is not null
        and private.normalize_phone(v_existing.phone_number) is distinct from v_phone_key)
      or (
        v_email is not null
        and nullif(lower(btrim(coalesce(v_existing.email, ''))), '') is distinct from v_email
      )
      or (v_license <> ''
        and lower(btrim(v_existing.drivers_license_number)) is distinct from lower(v_license))
      or (v_address <> ''
        and lower(btrim(coalesce(v_existing.address, ''))) is distinct from lower(v_address))
      or (v_facebook <> ''
        and lower(btrim(coalesce(v_existing.facebook_profile_url, ''))) is distinct from lower(v_facebook))
    then
      v_contact_note :=
        'Contact details supplied at booking (differ from customer record; not applied): '
        || 'name: ' || coalesce(nullif(v_full_name, ''), '(on file)')
        || '; phone: ' || coalesce(nullif(v_phone, ''), '(on file)')
        || '; email: ' || coalesce(v_email, '(none)')
        || '; license: ' || coalesce(nullif(v_license, ''), '(on file)')
        || '; address: ' || coalesce(nullif(v_address, ''), '(on file)')
        || '; facebook: ' || coalesce(nullif(v_facebook, ''), '(on file)');
    end if;
  end if;

  v_rental_notes := coalesce(v_notes, 'Booked online by customer — awaiting reservation fee');
  if v_contact_note is not null then
    v_rental_notes := v_rental_notes || E'\n' || v_contact_note;
  end if;

  v_reference :=
    'WEB-'
    || to_char(timezone('Asia/Manila', now()), 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.rentals (
    reference_number,
    customer_id,
    vehicle_id,
    start_at,
    expected_return_at,
    pickup_location,
    return_location,
    destination,
    passenger_count,
    renter_license_selfie_path,
    renter_government_id_path,
    status,
    notes,
    quoted_daily_rate,
    quoted_half_day_rate,
    quoted_hourly_rate,
    quoted_days,
    quoted_hours,
    quoted_total,
    deposit_percent,
    deposit_amount,
    balance_due,
    payment_status,
    booking_source,
    with_driver,
    driver_daily_rate,
    driver_days,
    driver_fee
  )
  values (
    v_reference,
    v_customer_id,
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    v_pickup,
    v_return,
    v_destination,
    p_passenger_count,
    v_selfie,
    v_gov_id,
    'draft',
    v_rental_notes,
    v_daily_rate,
    v_half_day_rate,
    v_hourly_rate,
    v_days,
    v_hours,
    v_quoted_total,
    null,
    v_deposit_amount,
    v_balance_due,
    'unpaid',
    'public_web',
    v_with_driver,
    case when v_with_driver then v_driver_rate end,
    v_driver_days,
    v_driver_fee
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
    'quoted_half_day_rate', v_half_day_rate,
    'quoted_hourly_rate', v_hourly_rate,
    'quoted_days', v_days,
    'quoted_hours', v_hours,
    'quoted_total', v_quoted_total,
    'with_driver', v_with_driver,
    'driver_daily_rate', case when v_with_driver then v_driver_rate end,
    'driver_days', v_driver_days,
    'driver_fee', v_driver_fee,
    'deposit_amount', v_deposit_amount,
    'balance_due', v_balance_due,
    'payment_status', 'unpaid',
    'message', 'Booking received. Pay the reservation fee and upload your proof to confirm.'
  );
exception
  when exclusion_violation then
    raise exception
      'Those dates are already booked for this car. Pick different dates or another vehicle.'
      using errcode = 'P0001';
end;
$function$;

revoke all on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text, boolean
) to anon, authenticated;
