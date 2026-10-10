-- ===========================================================================
-- Customers cancel their own bookings; bookings record the accepted terms.
--
-- 1. rentals.terms_version / terms_accepted_at: which booking terms (the
--    rental agreement + cancellation policy, AGREEMENT_TEMPLATE_VERSION) the
--    renter ticked before booking online.
-- 2. create_public_booking gains a trailing p_terms_version (default null, so
--    callers that do not send it keep working).
-- 3. get_booking_payment_details also returns the cancellation outcome, so
--    the pay page can say whether the reservation fee is refunded.
-- 4. cancel_my_booking: the signed-in owner cancels a draft or reserved
--    booking. Once anything was paid (proof sent or fee confirmed), a
--    cancellation inside free_cancellation_hours before pickup keeps the fee,
--    as the cancellation policy states; this is decided and stored once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Accepted terms on the rental
-- ---------------------------------------------------------------------------
alter table public.rentals
  add column terms_version text
    check (terms_version is null or char_length(terms_version) between 1 and 40),
  add column terms_accepted_at timestamptz;

comment on column public.rentals.terms_version is
  'Booking terms version the renter accepted online (rental agreement + cancellation policy).';
comment on column public.rentals.terms_accepted_at is
  'When the renter accepted terms_version on the booking form.';

-- ---------------------------------------------------------------------------
-- 2. Booking RPC (+ p_terms_version)
-- ---------------------------------------------------------------------------
drop function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text, boolean
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
  p_with_driver boolean default false,
  p_terms_version text default null::text
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
  text, text, text, integer, text, text, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text, boolean, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pay page details (+ cancellation outcome)
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
  v_deposit record;
  v_dates_taken boolean := false;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.reference_number,
    r.status,
    r.vehicle_id,
    r.start_at,
    r.expected_return_at,
    r.quoted_daily_rate,
    r.quoted_half_day_rate,
    r.quoted_hourly_rate,
    r.quoted_days,
    r.quoted_hours,
    r.quoted_total,
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
    o.name as company_name
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
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_half_day_rate', v_row.quoted_half_day_rate,
    'quoted_hourly_rate', v_row.quoted_hourly_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_hours', v_row.quoted_hours,
    'quoted_total', v_row.quoted_total,
    'deposit_percent', v_row.deposit_percent,
    'deposit_amount', v_row.deposit_amount,
    'balance_due', v_row.balance_due,
    'payment_status', v_row.payment_status,
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

-- ---------------------------------------------------------------------------
-- 4. Customer cancellation
-- ---------------------------------------------------------------------------
create function public.cancel_my_booking(p_rental_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_rental record;
  v_free_hours integer;
  v_deposit_confirmed numeric(12, 2) := 0;
  v_paid boolean;
  v_forfeited boolean;
begin
  if v_auth_uid is null then
    raise exception 'Sign in to cancel your booking.' using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a booking to cancel.' using errcode = '22023';
  end if;

  select nullif(lower(btrim(u.email)), '')
  into v_auth_email
  from auth.users u
  where u.id = v_auth_uid;

  -- Same ownership rule as list_my_bookings.
  select
    r.id,
    r.reference_number,
    r.status,
    r.start_at,
    r.payment_status,
    r.deposit_amount,
    v.name as vehicle_name,
    c.full_name as customer_name
  into v_rental
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
  where r.id = p_rental_id
    and (
      (v_auth_email is not null and lower(btrim(coalesce(c.email, ''))) = v_auth_email)
      or (r.created_by = v_auth_uid and r.booking_source = 'public_web')
    )
  for update of r;

  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  if v_rental.status not in ('draft', 'reserved') then
    raise exception 'This booking can no longer be cancelled online. Message us for help.'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(p.amount), 0)
  into v_deposit_confirmed
  from public.payments p
  where p.rental_id = v_rental.id
    and p.payment_type = 'deposit'
    and p.status = 'confirmed';

  v_paid := v_deposit_confirmed > 0
    or v_rental.payment_status in ('proof_submitted', 'deposit_paid', 'paid_in_full');

  if v_paid then
    select c.free_cancellation_hours
    into v_free_hours
    from public.company_profile c
    limit 1;
    v_forfeited :=
      now() > v_rental.start_at - make_interval(hours => coalesce(v_free_hours, 24));
  end if;

  update public.rentals
  set status = 'cancelled',
      cancellation_reason = 'customer_request',
      cancellation_note = 'Cancelled by the customer online.',
      reservation_fee_forfeited = v_forfeited
  where id = v_rental.id;

  perform private.write_audit_log(
    'rental.transitioned',
    'rental',
    v_rental.id,
    jsonb_build_object('status', v_rental.status),
    jsonb_build_object(
      'status', 'cancelled',
      'cancellation_reason', 'customer_request',
      'cancelled_by', 'customer',
      'deposit_paid', v_deposit_confirmed,
      'reservation_fee_forfeited', v_forfeited
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'reference_number', v_rental.reference_number,
    'vehicle_name', v_rental.vehicle_name,
    'customer_name', v_rental.customer_name,
    'start_at', v_rental.start_at,
    'deposit_amount', v_rental.deposit_amount,
    'paid', v_paid,
    'reservation_fee_forfeited', v_forfeited
  );
end;
$function$;

revoke all on function public.cancel_my_booking(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

comment on function public.cancel_my_booking(uuid) is
  'Signed-in owner cancels their draft or reserved booking. Once paid, cancelling inside free_cancellation_hours before pickup keeps the reservation fee (stored on reservation_fee_forfeited).';
