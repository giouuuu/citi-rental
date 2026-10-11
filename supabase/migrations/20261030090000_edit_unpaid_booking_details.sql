-- Renters can fix what they typed into the booking form until they pay.
--
-- 1. get_my_booking also returns the renter's address, Facebook and license
--    (only when the customer record is the signed-in account's own) and
--    whether the details can still be edited.
-- 2. update_my_booking_details: the signed-in owner edits their details and
--    the trip details of a draft booking with nothing paid. The car, dates and
--    driving mode set the price and the hold, so they stay as booked.

-- ---------------------------------------------------------------------------
-- Shared rule: a draft with no reservation fee sent or confirmed.
-- ---------------------------------------------------------------------------
create or replace function private.booking_details_editable(p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.rentals r
    where r.id = p_rental_id
      and r.status = 'draft'
      and r.payment_status = 'unpaid'
      and not exists (
        select 1
        from public.payments p
        where p.rental_id = r.id
          and p.payment_type = 'deposit'
          and p.status in ('submitted', 'confirmed')
      )
  );
$function$;

revoke all on function private.booking_details_editable(uuid)
  from public, anon, authenticated, service_role;

comment on function private.booking_details_editable(uuid) is
  'True while a booking is a draft with no reservation fee submitted or confirmed: the renter may still edit their details.';

-- ---------------------------------------------------------------------------
-- 1. get_my_booking
-- ---------------------------------------------------------------------------
create or replace function public.get_my_booking(p_rental_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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

-- ---------------------------------------------------------------------------
-- 2. update_my_booking_details
-- ---------------------------------------------------------------------------
create function public.update_my_booking_details(
  p_rental_id uuid,
  p_full_name text,
  p_phone_number text,
  p_address text,
  p_facebook_account text,
  p_drivers_license_number text,
  p_pickup_location text,
  p_return_location text,
  p_destination text,
  p_passenger_count integer
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
    v.name as vehicle_name,
    v.seating_capacity
  into v_rental
  from public.rentals r
  inner join public.customers c on c.id = r.customer_id
  inner join public.vehicles v on v.id = r.vehicle_id
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

  if v_pickup = '' or char_length(v_pickup) > 200 then
    raise exception 'Enter the pick-up or delivery location.' using errcode = '22023';
  end if;
  if v_return = '' or char_length(v_return) > 200 then
    raise exception 'Enter the return location.' using errcode = '22023';
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
      passenger_count = p_passenger_count
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
      'passenger_count', v_rental.passenger_count
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
      'passenger_count', p_passenger_count
    ),
    jsonb_build_object('edited_by', 'customer')
  );

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'reference_number', v_rental.reference_number,
    'vehicle_name', v_rental.vehicle_name,
    'customer_name', v_full_name,
    'customer_phone', v_phone
  );
end;
$function$;

revoke all on function public.update_my_booking_details(uuid, text, text, text, text, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.update_my_booking_details(uuid, text, text, text, text, text, text, text, text, integer)
  to authenticated;

comment on function public.update_my_booking_details(uuid, text, text, text, text, text, text, text, text, integer) is
  'Signed-in owner edits their details and the trip details of a draft booking until a reservation fee is submitted. Car, dates and driving mode stay as booked.';
