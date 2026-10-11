-- ===========================================================================
-- Fees added to every online booking.
--
-- Owners tick "Add to every online booking" on a charge type (Settings →
-- Charge types) to charge it on each booking, e.g. a booking or cleaning fee.
-- The customer sees it in the booking total before confirming and on the pay
-- page bill. Like the driver and delivery fees, the fees are snapshotted on
-- the rental and are part of quoted_total, so the reservation fee cap,
-- balance, bill and revenue reports include them with no other change.
--
-- 1. rental_charge_types.add_to_bookings (needs a default amount).
-- 2. rentals.booking_fees (the lines, as booked) and booking_fees_total.
-- 3. private.booking_fee_lines / booking_fee_total.
-- 4. get_public_booking_fees lists them for the booking form.
-- 5. create_public_booking adds them. Same signature as 20261112090000.
-- 6. get_booking_payment_details (as 20261113090000_customer_pays_open_bill
--    left it) and get_my_booking return them.
--
-- Bookings staff create in the ops app are not changed: staff add charges
-- on the Bill & payments tab as before.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The toggle on charge types
-- ---------------------------------------------------------------------------
alter table public.rental_charge_types
  add column add_to_bookings boolean not null default false;

alter table public.rental_charge_types
  add constraint rental_charge_types_booking_fee_amount
  check (not add_to_bookings or coalesce(default_amount, 0) > 0);

comment on column public.rental_charge_types.add_to_bookings is
  'Charged on every online booking at default_amount, shown to the customer before they confirm.';

-- ---------------------------------------------------------------------------
-- 2. The fees on the rental
-- ---------------------------------------------------------------------------
alter table public.rentals
  add column booking_fees jsonb not null default '[]'::jsonb
    check (jsonb_typeof(booking_fees) = 'array'),
  add column booking_fees_total numeric(12, 2) not null default 0
    check (booking_fees_total >= 0);

comment on column public.rentals.booking_fees is
  'Fees added to every online booking, as booked: [{charge_type_id, name, amount}]. Their sum is booking_fees_total, inside quoted_total.';
comment on column public.rentals.booking_fees_total is
  'Sum of booking_fees, included in quoted_total.';

-- ---------------------------------------------------------------------------
-- 3. Today's booking fees
-- ---------------------------------------------------------------------------
create function private.booking_fee_lines()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'charge_type_id', t.id,
      'name', t.name,
      'amount', t.default_amount
    ) order by t.sort_order, t.name), '[]'::jsonb)
  from public.rental_charge_types t
  where t.is_active
    and t.add_to_bookings
    and t.default_amount > 0;
$$;

create function private.booking_fee_total(p_lines jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(sum((line ->> 'amount')::numeric), 0), 2)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line;
$$;

revoke all on function private.booking_fee_lines()
  from public, anon, authenticated, service_role;
revoke all on function private.booking_fee_total(jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Public fees for the booking form
-- ---------------------------------------------------------------------------
create or replace function public.get_public_booking_fees()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'delivery_fee_within_city', c.delivery_fee_within_city,
    'delivery_fee_outside_city', c.delivery_fee_outside_city,
    'office_address', nullif(btrim(c.operating_address), ''),
    'car_wash_fee', (
      select t.default_amount
      from public.rental_charge_types t
      where t.code = 'car_wash' and t.is_active
    ),
    'booking_fees', (
      select coalesce(jsonb_agg(line - 'charge_type_id'), '[]'::jsonb)
      from jsonb_array_elements(private.booking_fee_lines()) as line
    )
  )
  from public.company_profile c
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Online bookings add them
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
  -- quote it.
  v_pickup_fee := private.delivery_fee(v_pickup_method, v_within_city_fee, v_outside_city_fee);
  v_return_fee := private.delivery_fee(v_return_method, v_within_city_fee, v_outside_city_fee);
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
-- 6. Pay page and booking detail show them
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_payment_details(p_rental_id uuid, p_reference_number text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_row record;
  v_rental public.rentals%rowtype;
  v_deposit record;
  v_dates_taken boolean := false;
  v_pending_amount numeric(12, 2);
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to see your booking.' using errcode = '42501';
  end if;
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;
  -- Same message as a wrong reference, so the page never confirms a booking exists.
  if not (private.is_my_booking(p_rental_id) or private.is_org_admin()) then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  select
    r.id,
    r.reference_number,
    r.status,
    r.vehicle_id,
    r.start_at,
    r.expected_return_at,
    r.pickup_location,
    r.return_location,
    r.quoted_daily_rate,
    r.quoted_half_day_rate,
    r.quoted_hourly_rate,
    r.quoted_days,
    r.quoted_hours,
    r.quoted_total,
    r.with_driver,
    r.driver_daily_rate,
    r.driver_days,
    r.driver_fee,
    r.pickup_method,
    r.return_method,
    r.pickup_delivery_fee,
    r.return_delivery_fee,
    r.booking_fees,
    r.deposit_percent,
    r.deposit_amount,
    r.balance_due,
    r.payment_status,
    r.cancelled_at,
    r.reservation_fee_forfeited,
    v.name as vehicle_name,
    v.make as vehicle_make,
    v.model as vehicle_model,
    o.payment_qr_url,
    o.payment_instructions,
    o.name as company_name,
    (
      select t.default_amount
      from public.rental_charge_types t
      where t.code = 'car_wash' and t.is_active
    ) as car_wash_fee
  into v_row
  from public.rentals r
  inner join public.vehicles v
    on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.id = p_rental_id
    and r.reference_number = v_ref
    and o.is_active
    and o.show_on_public_site;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  select r.* into v_rental from public.rentals r where r.id = v_row.id;

  select
    p.id,
    p.external_reference,
    p.proof_path,
    p.submitted_at,
    p.status
  into v_deposit
  from public.payments p
  where p.rental_id = v_row.id
    and p.payment_type = 'deposit'
  order by
    case p.status
      when 'submitted' then 0
      when 'confirmed' then 1
      else 2
    end,
    p.submitted_at desc
  limit 1;

  select coalesce(sum(p.amount), 0)
  into v_pending_amount
  from public.payments p
  where p.rental_id = v_row.id
    and p.payment_type = 'balance'
    and p.status = 'submitted';

  -- The pay page warns before the customer sends money for dates already
  -- held (20261019100000_paid_drafts_hold_dates).
  if v_row.status = 'draft'
    and not private.rental_holds_dates(v_row.status, v_row.payment_status) then
    v_dates_taken := exists (
      select 1
      from private.rental_schedule_conflict(
        v_row.vehicle_id, v_row.start_at, v_row.expected_return_at, v_row.id
      )
    );
  end if;

  return jsonb_build_object(
    'rental_id', v_row.id,
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'start_at', v_row.start_at,
    'expected_return_at', v_row.expected_return_at,
    'pickup_location', v_row.pickup_location,
    'return_location', v_row.return_location,
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_half_day_rate', v_row.quoted_half_day_rate,
    'quoted_hourly_rate', v_row.quoted_hourly_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_hours', v_row.quoted_hours,
    'quoted_total', v_row.quoted_total,
    'with_driver', v_row.with_driver,
    'driver_daily_rate', v_row.driver_daily_rate,
    'driver_days', v_row.driver_days,
    'driver_fee', v_row.driver_fee,
    'pickup_method', v_row.pickup_method,
    'return_method', v_row.return_method,
    'pickup_delivery_fee', v_row.pickup_delivery_fee,
    'return_delivery_fee', v_row.return_delivery_fee,
    'booking_fees', v_row.booking_fees,
    'car_wash_fee', v_row.car_wash_fee,
    'deposit_percent', v_row.deposit_percent,
    'deposit_amount', v_row.deposit_amount,
    'balance_due', v_row.balance_due,
    'payment_status', v_row.payment_status,
    'payment_kind', private.customer_payment_kind(v_rental),
    'bill_total', public.bill_total(v_rental),
    'amount_paid', public.amount_paid(v_rental),
    'pending_payment_amount', v_pending_amount,
    'cancelled_at', v_row.cancelled_at,
    'reservation_fee_forfeited', v_row.reservation_fee_forfeited,
    'payment_reference', v_deposit.external_reference,
    'has_payment_proof', v_deposit.proof_path is not null,
    'payment_proof_submitted_at', v_deposit.submitted_at,
    'deposit_payment_id', v_deposit.id,
    'deposit_payment_status', v_deposit.status,
    'dates_taken', v_dates_taken,
    'vehicle_name', v_row.vehicle_name,
    'vehicle_make', v_row.vehicle_make,
    'vehicle_model', v_row.vehicle_model,
    'payment_qr_url', v_row.payment_qr_url,
    'payment_instructions', v_row.payment_instructions,
    'company_name', v_row.company_name
  );
end;
$function$;

create or replace function public.get_my_booking(p_rental_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_row record;
  v_payments jsonb;
  v_review jsonb;
  v_free_hours integer;
  v_auth_email text;
  v_customer_is_mine boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your booking.' using errcode = '42501';
  end if;
  if p_rental_id is null or not private.owns_booking(p_rental_id) then
    return null;
  end if;

  select nullif(lower(btrim(u.email)), '')
  into v_auth_email
  from auth.users u
  where u.id = auth.uid();

  select
    r.*,
    v.name as vehicle_name,
    v.make as vehicle_make,
    v.model as vehicle_model,
    v.year as vehicle_year,
    v.plate_number as vehicle_plate,
    v.photo_url as vehicle_photo_url,
    v.transmission::text as vehicle_transmission,
    v.seating_capacity as vehicle_seats,
    c.full_name as customer_name,
    c.phone_number as customer_phone,
    c.email as customer_email,
    c.address as customer_address,
    c.facebook_profile_url as customer_facebook,
    c.drivers_license_number as customer_license
  into v_row
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  inner join public.customers c on c.id = r.customer_id
  where r.id = p_rental_id;

  -- A booking staff filed under someone else's record still shows to the
  -- account that made it, but that record's private details do not.
  v_customer_is_mine := v_auth_email is not null
    and lower(btrim(coalesce(v_row.customer_email, ''))) = v_auth_email;

  -- The renter's side of the ledger: amounts, kinds and status. Staff notes
  -- and proof files stay internal.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'payment_type', p.payment_type,
      'amount', p.amount,
      'method', p.method,
      'status', p.status,
      'external_reference', p.external_reference,
      'submitted_at', p.submitted_at,
      'confirmed_at', p.confirmed_at,
      'charge_type_name', t.name,
      'charge_type_code', t.code
    ) order by p.submitted_at desc), '[]'::jsonb)
  into v_payments
  from public.payments p
  left join public.rental_charge_types t on t.id = p.charge_type_id
  where p.rental_id = p_rental_id
    and p.status <> 'cancelled';

  select jsonb_build_object(
      'id', cr.id,
      'rating', cr.rating,
      'body', cr.body,
      'reviewer_name', cr.reviewer_name,
      'is_published', not cr.is_hidden,
      'created_at', cr.created_at
    )
  into v_review
  from public.customer_reviews cr
  where cr.rental_id = p_rental_id;

  select o.free_cancellation_hours into v_free_hours
  from public.company_profile o
  limit 1;

  return jsonb_build_object(
    'id', v_row.id,
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'payment_status', v_row.payment_status,
    'booking_source', v_row.booking_source,
    'created_at', v_row.created_at,
    'start_at', v_row.start_at,
    'expected_return_at', v_row.expected_return_at,
    'actual_return_at', v_row.actual_return_at,
    'pickup_location', v_row.pickup_location,
    'return_location', v_row.return_location,
    'pickup_method', v_row.pickup_method,
    'return_method', v_row.return_method,
    'pickup_delivery_fee', v_row.pickup_delivery_fee,
    'return_delivery_fee', v_row.return_delivery_fee,
    'booking_fees', v_row.booking_fees,
    'destination', v_row.destination,
    'passenger_count', v_row.passenger_count,
    'with_driver', v_row.with_driver,
    'driver_daily_rate', v_row.driver_daily_rate,
    'driver_days', v_row.driver_days,
    'driver_fee', v_row.driver_fee,
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_half_day_rate', v_row.quoted_half_day_rate,
    'quoted_hourly_rate', v_row.quoted_hourly_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_hours', v_row.quoted_hours,
    'quoted_total', v_row.quoted_total,
    'deposit_amount', v_row.deposit_amount,
    'cancelled_at', v_row.cancelled_at,
    'cancellation_reason', v_row.cancellation_reason,
    'reservation_fee_forfeited', v_row.reservation_fee_forfeited,
    'terms_version', v_row.terms_version,
    'terms_accepted_at', v_row.terms_accepted_at,
    'free_cancellation_hours', v_free_hours,
    'details_editable', v_customer_is_mine and private.booking_details_editable(p_rental_id),
    'vehicle', jsonb_build_object(
      'id', v_row.vehicle_id,
      'name', v_row.vehicle_name,
      'make', v_row.vehicle_make,
      'model', v_row.vehicle_model,
      'year', v_row.vehicle_year,
      'plate_number', v_row.vehicle_plate,
      'photo_url', v_row.vehicle_photo_url,
      'transmission', v_row.vehicle_transmission,
      'seating_capacity', v_row.vehicle_seats
    ),
    'customer', jsonb_build_object(
      'full_name', v_row.customer_name,
      'phone_number', v_row.customer_phone,
      'email', v_row.customer_email,
      'address', case when v_customer_is_mine then v_row.customer_address end,
      'facebook_account', case when v_customer_is_mine then v_row.customer_facebook end,
      'drivers_license_number', case when v_customer_is_mine then v_row.customer_license end
    ),
    'payments', v_payments,
    'review', v_review
  );
end;
$function$;
