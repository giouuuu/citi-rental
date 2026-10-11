-- ===========================================================================
-- Delivery and collection are free with a driver.
--
-- The driver brings the car to the renter and takes it back, so a
-- with-driver online booking charges no per-way delivery or collection fee,
-- within or outside Cebu City. Mirrors deliveryFee in
-- src/features/booking/lib/handover.ts.
--
-- 1. create_public_booking: both legs are 0 with a driver. Otherwise as
--    20261114090000_booking_fees left it; same signature, grants kept.
-- 2. update_my_booking_details: a changed leg on a with-driver booking is 0.
--    An unchanged leg still keeps the fee it was booked at, so bookings made
--    before this change keep what they were quoted. Otherwise as
--    20261112090000_booking_delivery_fees left it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. New bookings
-- ---------------------------------------------------------------------------
create or replace function public.create_public_booking(
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
  p_with_driver boolean default false,
  p_terms_version text default null::text,
  p_pickup_method text default null::text,
  p_return_method text default null::text
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
  v_within_city_fee numeric(12, 2);
  v_outside_city_fee numeric(12, 2);
  v_office text;
  v_pickup_method text := nullif(btrim(coalesce(p_pickup_method, '')), '');
  v_return_method text := nullif(btrim(coalesce(p_return_method, '')), '');
  v_pickup_fee numeric(12, 2) := 0;
  v_return_fee numeric(12, 2) := 0;
  v_booking_fees jsonb;
  v_booking_fees_total numeric(12, 2);
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
  v_terms_version text := nullif(btrim(coalesce(p_terms_version, '')), '');
begin
  if p_vehicle_id is null then
    raise exception 'Select a vehicle to book.' using errcode = '22023';
  end if;
  if v_terms_version is not null and char_length(v_terms_version) > 40 then
    raise exception 'Invalid terms version.' using errcode = '22023';
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

  -- No method: a form from before delivery pricing. The typed location
  -- stands and staff add any delivery charge, as they did before.
  if v_pickup_method is not null
    and v_pickup_method not in ('office', 'within_city', 'outside_city') then
    raise exception 'Choose where you get the car.' using errcode = '22023';
  end if;
  if v_return_method is not null
    and v_return_method not in ('office', 'within_city', 'outside_city') then
    raise exception 'Choose where you return the car.' using errcode = '22023';
  end if;

  -- Trip details are required for every booking, new or returning. At the
  -- office there is no address to type; it is filled in below.
  if (v_pickup is null and v_pickup_method is distinct from 'office')
    or char_length(v_pickup) > 200 then
    raise exception 'Enter the delivery address.' using errcode = '22023';
  end if;
  if (v_return is null and v_return_method is distinct from 'office')
    or char_length(v_return) > 200 then
    raise exception 'Enter where we collect the car.' using errcode = '22023';
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
    if v_with_driver then
      raise exception 'Upload a selfie holding your government ID.' using errcode = '22023';
    end if;
    raise exception 'Upload a selfie holding your driver''s license.' using errcode = '22023';
  end if;
  if v_gov_id is null
    or v_gov_id !~ '^[0-9a-f-]{36}/government-id\.(jpg|png|webp|gif)$'
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'booking-ids' and o.name = v_gov_id
    )
  then
    if v_with_driver then
      raise exception 'Upload a photo of your government ID.' using errcode = '22023';
    end if;
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
    o.driver_daily_rate,
    o.delivery_fee_within_city,
    o.delivery_fee_outside_city,
    nullif(btrim(o.operating_address), '')
  into
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_half_day_rate,
    v_hourly_rate,
    v_seats,
    v_reservation_fee,
    v_driver_rate,
    v_within_city_fee,
    v_outside_city_fee,
    v_office
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

  -- At the office, the location is the office.
  if v_pickup_method = 'office' then
    v_pickup := left(coalesce(v_office, 'Our office'), 200);
  end if;
  if v_return_method = 'office' then
    v_return := left(coalesce(v_office, 'Our office'), 200);
  end if;

  -- Online bookings bill every started 24 hours as a day at the daily rate.
  -- The 12-hour and hourly rates are still stored on the rental for staff
  -- (late returns, extensions) but never priced into a customer's quote.
  v_days := private.rental_driver_days(p_start_at, p_expected_return_at);
  v_hours := 0;
  v_quoted_total := round(v_days * v_daily_rate, 2);
  -- With a driver: the driver's day rate for every started 24 hours, added to
  -- the trip so the deposit, balance and bill all include it. No rate set in
  -- Settings means staff quote the driver when they confirm.
  if v_with_driver then
    v_driver_days := private.rental_driver_days(p_start_at, p_expected_return_at);
    v_driver_fee := round(coalesce(v_driver_rate, 0) * v_driver_days, 2);
    v_quoted_total := v_quoted_total + v_driver_fee;
  end if;
  -- Delivery and collection, per way, the same way. No rate set means staff
  -- quote it. With a driver both are free: the driver brings the car and
  -- takes it back.
  if v_with_driver then
    v_pickup_fee := 0;
    v_return_fee := 0;
  else
    v_pickup_fee := private.delivery_fee(v_pickup_method, v_within_city_fee, v_outside_city_fee);
    v_return_fee := private.delivery_fee(v_return_method, v_within_city_fee, v_outside_city_fee);
  end if;
  v_quoted_total := v_quoted_total + v_pickup_fee + v_return_fee;
  -- Fees the owner adds to every online booking (Settings → Charge types),
  -- snapshotted so a later price change never moves this booking.
  v_booking_fees := private.booking_fee_lines();
  v_booking_fees_total := private.booking_fee_total(v_booking_fees);
  v_quoted_total := v_quoted_total + v_booking_fees_total;
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

  if v_auth_email is not null then
    -- Signed in: the account's email is the customer's identity. A phone or
    -- license typed into the form never attaches this booking to someone
    -- else's record (where the booker could not see it and they could).
    select c.*
    into v_existing
    from public.customers c
    where lower(btrim(coalesce(c.email, ''))) = v_auth_email
    order by c.created_at asc
    limit 1
    for update;

    -- The license is unique: one already on another customer means staff
    -- must link that record to this account (add the email on it).
    if v_existing.id is null
      and v_license <> ''
      and exists (
        select 1 from public.customers c
        where lower(btrim(c.drivers_license_number)) = lower(v_license)
      )
    then
      raise exception 'That driver''s license is already on file under another customer. Message us and we''ll link it to your account.'
        using errcode = 'P0001';
    end if;
  else
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
  end if;

  if v_existing.id is null then
    if v_full_name = '' then
      raise exception 'Enter your full name.' using errcode = '22023';
    end if;
    if v_phone = '' then
      raise exception 'Enter a valid phone number.' using errcode = '22023';
    end if;
    -- The renter drives on self-drive only; a hired driver's license is staff's.
    if v_license = '' and not v_with_driver then
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
      nullif(v_license, ''),
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

    -- A customer first seen on a with-driver trip has no license on file.
    -- Self-drive needs one: fill the gap (never overwrite one on file).
    if not v_with_driver and nullif(btrim(coalesce(v_existing.drivers_license_number, '')), '') is null then
      if v_license = '' then
        raise exception 'Enter your driver license number.' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.customers c
        where c.id <> v_existing.id
          and lower(btrim(c.drivers_license_number)) = lower(v_license)
      ) then
        raise exception 'That driver license number is already on another customer. Please contact support.'
          using errcode = 'P0001';
      end if;
      update public.customers
      set drivers_license_number = v_license, updated_at = now()
      where id = v_existing.id;
      v_existing.drivers_license_number := v_license;
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
        and lower(btrim(coalesce(v_existing.drivers_license_number, ''))) is distinct from lower(v_license))
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
    driver_fee,
    pickup_method,
    return_method,
    pickup_delivery_fee,
    return_delivery_fee,
    booking_fees,
    booking_fees_total,
    terms_version,
    terms_accepted_at
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
    v_driver_fee,
    v_pickup_method,
    v_return_method,
    v_pickup_fee,
    v_return_fee,
    v_booking_fees,
    v_booking_fees_total,
    v_terms_version,
    case when v_terms_version is not null then now() end
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
    'pickup_method', v_pickup_method,
    'return_method', v_return_method,
    'pickup_delivery_fee', v_pickup_fee,
    'return_delivery_fee', v_return_fee,
    'booking_fees', v_booking_fees,
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

-- ---------------------------------------------------------------------------
-- 2. Edited bookings
-- ---------------------------------------------------------------------------
create or replace function public.update_my_booking_details(
  p_rental_id uuid,
  p_full_name text,
  p_phone_number text,
  p_address text,
  p_facebook_account text,
  p_drivers_license_number text,
  p_pickup_location text,
  p_return_location text,
  p_destination text,
  p_passenger_count integer,
  p_pickup_method text default null,
  p_return_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_rental record;
  v_customer public.customers%rowtype;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone_number, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_facebook text := btrim(coalesce(p_facebook_account, ''));
  v_license text := btrim(coalesce(p_drivers_license_number, ''));
  v_pickup text := btrim(coalesce(p_pickup_location, ''));
  v_return text := btrim(coalesce(p_return_location, ''));
  v_destination text := btrim(coalesce(p_destination, ''));
  v_pickup_method text;
  v_return_method text;
  v_pickup_fee numeric(12, 2);
  v_return_fee numeric(12, 2);
  v_quoted_total numeric(12, 2);
  v_deposit_amount numeric(12, 2);
begin
  if v_auth_uid is null then
    raise exception 'Sign in to edit your booking.' using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a booking to edit.' using errcode = '22023';
  end if;

  select nullif(lower(btrim(u.email)), '')
  into v_auth_email
  from auth.users u
  where u.id = v_auth_uid;

  -- Same ownership rule as list_my_bookings, and the customer record must be
  -- this account's own: its details are what the renter is changing.
  select
    r.id,
    r.reference_number,
    r.status,
    r.with_driver,
    r.customer_id,
    r.pickup_location,
    r.return_location,
    r.destination,
    r.passenger_count,
    r.pickup_method,
    r.return_method,
    r.pickup_delivery_fee,
    r.return_delivery_fee,
    r.quoted_total,
    r.deposit_amount,
    v.name as vehicle_name,
    v.seating_capacity,
    o.reservation_fee,
    o.delivery_fee_within_city,
    o.delivery_fee_outside_city,
    nullif(btrim(o.operating_address), '') as office
  into v_rental
  from public.rentals r
  inner join public.customers c on c.id = r.customer_id
  inner join public.vehicles v on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.id = p_rental_id
    and (
      (v_auth_email is not null and lower(btrim(coalesce(c.email, ''))) = v_auth_email)
      or (r.created_by = v_auth_uid and r.booking_source = 'public_web')
    )
  for update of r;

  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  select c.* into v_customer
  from public.customers c
  where c.id = v_rental.customer_id
  for update;

  if v_auth_email is null
    or lower(btrim(coalesce(v_customer.email, ''))) <> v_auth_email
  then
    raise exception 'This booking is filed under another customer record. Message us to change your details.'
      using errcode = 'P0001';
  end if;
  if v_customer.is_blocked then
    raise exception 'Your customer profile cannot be changed right now. Please contact support.'
      using errcode = 'P0001';
  end if;

  if not private.booking_details_editable(v_rental.id) then
    raise exception 'Your reservation fee is in, so these details are locked. Message us to change them.'
      using errcode = 'P0001';
  end if;

  if char_length(v_full_name) not between 2 and 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;
  if char_length(v_phone) not between 7 and 40 then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if char_length(v_address) not between 5 and 300 then
    raise exception 'Enter your complete address.' using errcode = '22023';
  end if;
  if char_length(v_facebook) not between 2 and 200 then
    raise exception 'Enter your Facebook name or profile link.' using errcode = '22023';
  end if;
  -- The renter drives on self-drive only; with a driver a blank keeps what is on file.
  if v_license = '' and not v_rental.with_driver then
    raise exception 'Enter your driver license number.' using errcode = '22023';
  end if;
  if v_license <> '' and char_length(v_license) not between 3 and 80 then
    raise exception 'Enter your driver license number.' using errcode = '22023';
  end if;
  if v_license <> '' and exists (
    select 1 from public.customers c
    where c.id <> v_customer.id
      and lower(btrim(c.drivers_license_number)) = lower(v_license)
  ) then
    raise exception 'That driver''s license is already on file under another customer. Message us and we''ll link it to your account.'
      using errcode = 'P0001';
  end if;

  -- No method sent keeps the one booked.
  v_pickup_method := coalesce(nullif(btrim(coalesce(p_pickup_method, '')), ''), v_rental.pickup_method);
  v_return_method := coalesce(nullif(btrim(coalesce(p_return_method, '')), ''), v_rental.return_method);
  if v_pickup_method is not null
    and v_pickup_method not in ('office', 'within_city', 'outside_city') then
    raise exception 'Choose where you get the car.' using errcode = '22023';
  end if;
  if v_return_method is not null
    and v_return_method not in ('office', 'within_city', 'outside_city') then
    raise exception 'Choose where you return the car.' using errcode = '22023';
  end if;
  if v_pickup_method = 'office' then
    v_pickup := left(coalesce(v_rental.office, 'Our office'), 200);
  end if;
  if v_return_method = 'office' then
    v_return := left(coalesce(v_rental.office, 'Our office'), 200);
  end if;

  if v_pickup = '' or char_length(v_pickup) > 200 then
    raise exception 'Enter the delivery address.' using errcode = '22023';
  end if;
  if v_return = '' or char_length(v_return) > 200 then
    raise exception 'Enter where we collect the car.' using errcode = '22023';
  end if;
  if v_destination = '' or char_length(v_destination) > 200 then
    raise exception 'Enter your destination.' using errcode = '22023';
  end if;
  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 60 then
    raise exception 'Enter how many passengers.' using errcode = '22023';
  end if;
  if v_rental.seating_capacity is not null then
    if v_rental.with_driver and p_passenger_count > v_rental.seating_capacity - 1 then
      raise exception 'With a driver, this car seats % passengers.', v_rental.seating_capacity - 1
        using errcode = '22023';
    end if;
    if p_passenger_count > v_rental.seating_capacity then
      raise exception 'This car seats % passengers.', v_rental.seating_capacity
        using errcode = '22023';
    end if;
  end if;

  -- A leg whose method did not change keeps the fee it was booked at; a
  -- changed one is priced at today's Settings rate, or free with a driver.
  v_pickup_fee := case
    when v_pickup_method is not distinct from v_rental.pickup_method then v_rental.pickup_delivery_fee
    when v_rental.with_driver then 0
    else private.delivery_fee(v_pickup_method, v_rental.delivery_fee_within_city, v_rental.delivery_fee_outside_city)
  end;
  v_return_fee := case
    when v_return_method is not distinct from v_rental.return_method then v_rental.return_delivery_fee
    when v_rental.with_driver then 0
    else private.delivery_fee(v_return_method, v_rental.delivery_fee_within_city, v_rental.delivery_fee_outside_city)
  end;
  v_quoted_total := round(
    v_rental.quoted_total
      - v_rental.pickup_delivery_fee - v_rental.return_delivery_fee
      + v_pickup_fee + v_return_fee,
    2
  );
  -- Same rule as booking: the flat reservation fee, never more than the trip.
  -- A fee that was capped by a small trip total is re-capped on the new one.
  v_deposit_amount := least(
    case
      when v_rental.deposit_amount >= v_rental.quoted_total
        then coalesce(v_rental.reservation_fee, v_rental.deposit_amount)
      else v_rental.deposit_amount
    end,
    v_quoted_total
  );

  update public.customers
  set full_name = v_full_name,
      phone_number = v_phone,
      address = v_address,
      facebook_profile_url = v_facebook,
      drivers_license_number = coalesce(nullif(v_license, ''), drivers_license_number)
  where id = v_customer.id;

  update public.rentals
  set pickup_location = v_pickup,
      return_location = v_return,
      destination = v_destination,
      passenger_count = p_passenger_count,
      pickup_method = v_pickup_method,
      return_method = v_return_method,
      pickup_delivery_fee = v_pickup_fee,
      return_delivery_fee = v_return_fee,
      quoted_total = v_quoted_total,
      deposit_amount = v_deposit_amount,
      balance_due = round(v_quoted_total - v_deposit_amount, 2)
  where id = v_rental.id;

  perform private.write_audit_log(
    'rental.details_edited',
    'rental',
    v_rental.id,
    jsonb_build_object(
      'full_name', v_customer.full_name,
      'phone_number', v_customer.phone_number,
      'address', v_customer.address,
      'facebook_profile_url', v_customer.facebook_profile_url,
      'drivers_license_number', v_customer.drivers_license_number,
      'pickup_location', v_rental.pickup_location,
      'return_location', v_rental.return_location,
      'destination', v_rental.destination,
      'passenger_count', v_rental.passenger_count,
      'pickup_method', v_rental.pickup_method,
      'return_method', v_rental.return_method,
      'quoted_total', v_rental.quoted_total
    ),
    jsonb_build_object(
      'full_name', v_full_name,
      'phone_number', v_phone,
      'address', v_address,
      'facebook_profile_url', v_facebook,
      'drivers_license_number', coalesce(nullif(v_license, ''), v_customer.drivers_license_number),
      'pickup_location', v_pickup,
      'return_location', v_return,
      'destination', v_destination,
      'passenger_count', p_passenger_count,
      'pickup_method', v_pickup_method,
      'return_method', v_return_method,
      'quoted_total', v_quoted_total
    ),
    jsonb_build_object('edited_by', 'customer')
  );

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'reference_number', v_rental.reference_number,
    'vehicle_name', v_rental.vehicle_name,
    'customer_name', v_full_name,
    'customer_phone', v_phone,
    'pickup_location', v_pickup,
    'quoted_total', v_quoted_total,
    'price_changed', v_quoted_total <> v_rental.quoted_total
  );
end;
$function$;
