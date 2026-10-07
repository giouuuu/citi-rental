-- ===========================================================================
-- Rent priced on elapsed time, and bill adjustments.
--
-- 1. Cars get optional 12-hour and hourly rates beside the daily rate.
-- 2. Rent is priced on the hours the car is out, not the calendar days it
--    touches: every 24 hours at the daily rate, leftover hours at the
--    cheapest of one more day, the 12-hour rate, 12-hour + hourly past 12,
--    or hourly. private.rental_rent_quote is the rule; it mirrors
--    src/features/rentals/lib/rent-pricing.ts, which prices counter rentals.
-- 3. Rentals snapshot all three rates and the billed hours. quoted_days now
--    counts whole 24-hour days (0 for a trip under a day). Rentals quoted
--    before this keep inclusive calendar days and a null quoted_hours.
-- 4. A bill adjustment is a confirmed charge of the system type
--    `bill_adjustment` that may be negative, so a wrong bill can be put
--    right in either direction. Charges are already summed as plain amounts
--    by the balance, analytics, and finance statement, so a negative one
--    simply takes money off what was billed. Owners and admins only.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Rates
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column half_day_rate numeric(12, 2)
    constraint vehicles_half_day_rate_positive check (half_day_rate is null or half_day_rate > 0),
  add column hourly_rate numeric(12, 2)
    constraint vehicles_hourly_rate_positive check (hourly_rate is null or hourly_rate > 0);

comment on column public.vehicles.half_day_rate is
  'Price for up to 12 hours past the whole days, PHP. Null: leftover hours bill hourly or as a day.';
comment on column public.vehicles.hourly_rate is
  'Price per leftover hour, PHP. Null: leftover hours bill at the 12-hour rate or as a day.';

alter table public.rentals
  add column quoted_half_day_rate numeric(12, 2),
  add column quoted_hourly_rate numeric(12, 2),
  add column quoted_hours smallint
    constraint rentals_quoted_hours_range check (quoted_hours is null or quoted_hours between 0 and 23);

alter table public.rentals drop constraint rentals_quoted_days_positive;
alter table public.rentals add constraint rentals_quoted_days_nonnegative
  check (quoted_days is null or quoted_days >= 0);

comment on column public.rentals.quoted_days is
  'Whole 24-hour days billed. Rentals quoted before elapsed-time pricing (quoted_hours null) hold inclusive calendar days.';
comment on column public.rentals.quoted_hours is
  'Hours billed past the whole days (0-23), priced with the snapshot 12-hour and hourly rates. Null on rentals quoted by calendar days.';

-- ---------------------------------------------------------------------------
-- 2. The pricing rule
-- ---------------------------------------------------------------------------
create or replace function private.rental_rent_quote(
  p_start_at timestamptz,
  p_return_at timestamptz,
  p_daily_rate numeric,
  p_half_day_rate numeric default null,
  p_hourly_rate numeric default null
)
returns table (days integer, hours integer, total numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_total_hours integer;
  v_leftover numeric;
begin
  if p_return_at <= p_start_at or p_daily_rate is null or p_daily_rate <= 0 then
    raise exception 'Return must be after pick-up, and the car needs a daily rate.'
      using errcode = '22023';
  end if;

  -- Part of an hour bills as a whole hour.
  v_total_hours := ceil(extract(epoch from (p_return_at - p_start_at)) / 3600.0)::integer;
  days := v_total_hours / 24;
  hours := v_total_hours % 24;

  v_leftover := 0;
  if hours > 0 then
    v_leftover := p_daily_rate;
    if p_half_day_rate > 0 and hours <= 12 then
      v_leftover := least(v_leftover, p_half_day_rate);
    end if;
    if p_hourly_rate > 0 then
      v_leftover := least(v_leftover, round(hours * p_hourly_rate, 2));
    end if;
    if p_half_day_rate > 0 and p_hourly_rate > 0 and hours > 12 then
      v_leftover := least(v_leftover, round(p_half_day_rate + (hours - 12) * p_hourly_rate, 2));
    end if;
  end if;

  total := round(days * p_daily_rate + v_leftover, 2);
  return next;
end;
$$;

revoke all on function private.rental_rent_quote(timestamptz, timestamptz, numeric, numeric, numeric)
  from public, anon, authenticated;

comment on function private.rental_rent_quote(timestamptz, timestamptz, numeric, numeric, numeric) is
  'Rent for a trip on elapsed time. Mirrors quoteRent in src/features/rentals/lib/rent-pricing.ts.';

-- ---------------------------------------------------------------------------
-- 3. Online bookings use the same rule
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
  p_government_id_path text default null::text
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
  v_deposit_percent numeric(5, 2);
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
    o.deposit_percent
  into
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_half_day_rate,
    v_hourly_rate,
    v_seats,
    v_deposit_percent
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

  select q.days, q.hours, q.total
  into v_days, v_hours, v_quoted_total
  from private.rental_rent_quote(
    p_start_at, p_expected_return_at, v_daily_rate, v_half_day_rate, v_hourly_rate
  ) q;
  v_deposit_amount := round(v_quoted_total * (v_deposit_percent / 100.0), 2);
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

  v_rental_notes := coalesce(v_notes, 'Booked online by customer — awaiting deposit');
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
    booking_source
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
    v_deposit_percent,
    v_deposit_amount,
    v_balance_due,
    'unpaid',
    'public_web'
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
$function$;

revoke all on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text
) to anon, authenticated;

-- The storefront quotes before booking, so it needs every rate.
drop function public.list_public_available_vehicles(date, date);
create function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric,
  color text, showcase_image_url text, half_day_rate numeric, hourly_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate,
    v.color, v.showcase_image_url, v.half_day_rate, v.hourly_rate
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

revoke all on function public.list_public_available_vehicles(date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_available_vehicles(date, date)
  to anon, authenticated;

drop function public.get_public_vehicle(uuid);
create function public.get_public_vehicle(p_vehicle_id uuid)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, status public.vehicle_status,
  daily_rate numeric, color text, showcase_image_url text,
  half_day_rate numeric, hourly_rate numeric
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
    v.daily_rate, v.color, v.showcase_image_url, v.half_day_rate, v.hourly_rate
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

revoke all on function public.get_public_vehicle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_vehicle(uuid)
  to anon, authenticated;

-- The pay page spells out the rent the same way the bill does.
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
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.reference_number,
    r.status,
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
    'payment_reference', v_deposit.external_reference,
    'has_payment_proof', v_deposit.proof_path is not null,
    'payment_proof_submitted_at', v_deposit.submitted_at,
    'deposit_payment_id', v_deposit.id,
    'deposit_payment_status', v_deposit.status,
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
-- 4. Bill adjustments
-- ---------------------------------------------------------------------------
insert into public.rental_charge_types (code, name, default_amount, is_active, sort_order)
values ('bill_adjustment', 'Bill adjustment', null, true, 999)
on conflict do nothing;

-- Charges stay positive except bill adjustments, which only
-- add_bill_adjustment writes.
alter table public.payments drop constraint payments_amount_check;
alter table public.payments add constraint payments_amount_check
  check (amount > 0 or (payment_type = 'penalty' and charge_type_id is not null and amount <> 0));

create or replace function public.add_bill_adjustment(
  p_rental_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status public.rental_status;
  v_type_id uuid;
  v_payment_id uuid;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can adjust a bill.' using errcode = '42501';
  end if;
  if p_amount is null or round(p_amount, 2) = 0 then
    raise exception 'Enter the amount to add or take off.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Say why the bill is changing (3 to 500 characters).' using errcode = '22023';
  end if;

  select ct.id into v_type_id
  from public.rental_charge_types ct
  where ct.code = 'bill_adjustment';
  if v_type_id is null then
    raise exception 'The bill adjustment type is missing.' using errcode = 'P0002';
  end if;

  select r.status into v_status
  from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cancelled rentals cannot be adjusted.' using errcode = 'check_violation';
  end if;

  insert into public.payments (
    rental_id, payment_type, charge_type_id, amount, currency, method,
    status, notes, submitted_at, confirmed_at, confirmed_by
  )
  values (
    p_rental_id, 'penalty', v_type_id, round(p_amount, 2), 'PHP', null,
    'confirmed', v_reason, now(), now(), v_user_id
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(p_rental_id);
  return v_payment_id;
end;
$$;

revoke all on function public.add_bill_adjustment(uuid, numeric, text) from public, anon;
grant execute on function public.add_bill_adjustment(uuid, numeric, text) to authenticated, service_role;

comment on function public.add_bill_adjustment(uuid, numeric, text) is
  'Owner/admin correction to a rental bill: a positive amount adds to it, a negative one takes off. Reason required; void_rental_charge undoes it.';
