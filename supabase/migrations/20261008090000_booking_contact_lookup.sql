-- Guest booking starts with "email or mobile number". An exact match on an
-- existing customer makes the guest a returning customer, who then books with
-- trip details only; the identity comes from the customer record.
--
-- 1. private.normalize_phone: one canonical form for phone matching, so
--    0917…, +63 917… and 917… are the same mobile number. Mirrored in
--    src/features/booking/lib/booking-contact.ts — keep the two in step.
-- 2. public.lookup_booking_contact: exact-match lookup. Granted to
--    service_role ONLY — the Next.js server action verifies Cloudflare
--    Turnstile first, so a bot cannot skip the challenge by calling PostgREST
--    directly with the publishable key. Rate-limited per hashed client IP.
--    Returns only a masked first initial, never the record.
-- 3. public.create_public_booking: phone matching uses the normalized form,
--    and full name / phone / license may be omitted when the email or phone
--    matches an existing customer (the record supplies them). Identity is
--    still never rewritten from the payload.

-- ---------------------------------------------------------------------------
-- 1. Phone normalization
-- ---------------------------------------------------------------------------
create or replace function private.normalize_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when d = '' then null
    when d ~ '^09[0-9]{9}$' then '+63' || substr(d, 2)
    when d ~ '^639[0-9]{9}$' then '+' || d
    when d ~ '^9[0-9]{9}$' then '+63' || d
    else '+' || d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$$;

comment on function private.normalize_phone(text) is
  'Canonical phone for matching: PH mobiles become +639XXXXXXXXX, anything else +<digits>. Mirrored by normalizePhone() in booking-contact.ts.';

create index if not exists customers_phone_normalized_idx
  on public.customers (private.normalize_phone(phone_number));

create index if not exists customers_email_lower_idx
  on public.customers (lower(btrim(email)))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 2. Rate-limited, exact-match contact lookup
-- ---------------------------------------------------------------------------
create table if not exists private.booking_contact_lookups (
  id bigint generated always as identity primary key,
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists booking_contact_lookups_client_idx
  on private.booking_contact_lookups (client_key, created_at desc);

comment on table private.booking_contact_lookups is
  'One row per guest contact lookup, keyed by a SHA-256 of the client IP (never the raw IP). Pruned after a day.';

create or replace function public.lookup_booking_contact(
  p_email text default null,
  p_phone text default null,
  p_client_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := private.normalize_phone(p_phone);
  v_client text := nullif(btrim(coalesce(p_client_key, '')), '');
  v_recent integer;
  v_name text;
begin
  if (v_email is null) = (v_phone is null) then
    raise exception 'Enter an email or a mobile number.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'Enter your full email address.' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) not between 9 and 16 then
    raise exception 'Enter your full mobile number.' using errcode = '22023';
  end if;

  if v_client is not null then
    delete from private.booking_contact_lookups
    where created_at < now() - interval '1 day';

    select count(*) into v_recent
    from private.booking_contact_lookups
    where client_key = v_client
      and created_at > now() - interval '10 minutes';

    if v_recent >= 10 then
      raise exception 'Too many lookups. Wait a few minutes and try again.'
        using errcode = 'P0001';
    end if;

    insert into private.booking_contact_lookups (client_key) values (v_client);
  end if;

  select c.full_name
  into v_name
  from public.customers c
  where (v_email is not null and lower(btrim(c.email)) = v_email)
     or (v_phone is not null and private.normalize_phone(c.phone_number) = v_phone)
  order by c.created_at asc
  limit 1;

  if v_name is null then
    return jsonb_build_object('returning', false);
  end if;

  return jsonb_build_object(
    'returning', true,
    'initial', upper(left(btrim(v_name), 1))
  );
end;
$$;

revoke all on function public.lookup_booking_contact(text, text, text)
  from public, anon, authenticated;
grant execute on function public.lookup_booking_contact(text, text, text)
  to service_role;

comment on function public.lookup_booking_contact(text, text, text) is
  'Guest booking contact lookup. Exact email or normalized phone only. service_role only: call after verifying Turnstile. Returns {returning, initial}.';

-- ---------------------------------------------------------------------------
-- 3. create_public_booking: normalized phone match, returning-customer form
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
  p_notes text default null::text
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
  v_pickup text := nullif(btrim(coalesce(p_pickup_location, '')), '');
  v_return text := nullif(btrim(coalesce(p_return_location, '')), '');
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
    o.deposit_percent
  into
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
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

    insert into public.customers (
      full_name,
      phone_number,
      email,
      drivers_license_number,
      notes
    )
    values (
      v_full_name,
      v_phone,
      v_email,
      v_license,
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
    then
      v_contact_note :=
        'Contact details supplied at booking (differ from customer record; not applied): '
        || 'name: ' || coalesce(nullif(v_full_name, ''), '(on file)')
        || '; phone: ' || coalesce(nullif(v_phone, ''), '(on file)')
        || '; email: ' || coalesce(v_email, '(none)')
        || '; license: ' || coalesce(nullif(v_license, ''), '(on file)');
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
    status,
    notes,
    quoted_daily_rate,
    quoted_days,
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
    coalesce(v_return, v_pickup),
    'draft',
    v_rental_notes,
    v_daily_rate,
    v_days,
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
$function$;
