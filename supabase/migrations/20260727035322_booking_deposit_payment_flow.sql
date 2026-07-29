-- Deposit booking flow: quote snapshot, draft-until-paid, payment proof, org QR settings.

create type public.rental_payment_status as enum (
  'unpaid',
  'proof_submitted',
  'deposit_paid',
  'paid_in_full',
  'refunded'
);

alter table public.organizations
  add column if not exists payment_qr_url text,
  add column if not exists payment_instructions text,
  add column if not exists deposit_percent numeric(5, 2) not null default 30
    constraint organizations_deposit_percent_check
      check (deposit_percent > 0 and deposit_percent <= 100);

comment on column public.organizations.payment_qr_url is
  'Public URL of GCash/Maya/bank QR shown on booking payment page.';
comment on column public.organizations.payment_instructions is
  'Manual payment instructions shown to customers (account name, number, notes).';
comment on column public.organizations.deposit_percent is
  'Percent of quoted total required before a booking can be reserved.';

alter table public.rentals
  add column if not exists quoted_daily_rate numeric(12, 2),
  add column if not exists quoted_days integer,
  add column if not exists quoted_total numeric(12, 2),
  add column if not exists deposit_percent numeric(5, 2),
  add column if not exists deposit_amount numeric(12, 2),
  add column if not exists balance_due numeric(12, 2),
  add column if not exists payment_status public.rental_payment_status not null default 'unpaid',
  add column if not exists payment_reference text,
  add column if not exists payment_proof_path text,
  add column if not exists payment_proof_submitted_at timestamptz,
  add column if not exists deposit_confirmed_at timestamptz,
  add column if not exists deposit_confirmed_by uuid
    references public.profiles (id) on delete set null;

alter table public.rentals
  drop constraint if exists rentals_quoted_days_positive;
alter table public.rentals
  add constraint rentals_quoted_days_positive
  check (quoted_days is null or quoted_days >= 1);

alter table public.rentals
  drop constraint if exists rentals_deposit_percent_range;
alter table public.rentals
  add constraint rentals_deposit_percent_range
  check (
    deposit_percent is null
    or (deposit_percent > 0 and deposit_percent <= 100)
  );

comment on column public.rentals.payment_status is
  'Manual deposit tracking: unpaid → proof_submitted → deposit_paid.';
comment on column public.rentals.payment_proof_path is
  'Storage object path in payment-proofs bucket.';

-- Private bucket for customer payment screenshots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment_proofs_insert_public" on storage.objects;
drop policy if exists "payment_proofs_select_admin" on storage.objects;
drop policy if exists "payment_proofs_update_admin" on storage.objects;
drop policy if exists "payment_proofs_delete_admin" on storage.objects;

-- Guests upload proof with an unguessable path; ops read via signed URLs / admin select.
create policy "payment_proofs_insert_public"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'payment-proofs');

create policy "payment_proofs_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy "payment_proofs_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin')
);

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
  v_vehicle_name text;
  v_daily_rate numeric(12, 2);
  v_deposit_percent numeric(5, 2);
  v_days integer;
  v_quoted_total numeric(12, 2);
  v_deposit_amount numeric(12, 2);
  v_balance_due numeric(12, 2);
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

  select
    v.organization_id,
    v.status,
    v.name,
    v.daily_rate,
    o.deposit_percent
  into
    v_organization_id,
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_deposit_percent
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
    notes,
    quoted_daily_rate,
    quoted_days,
    quoted_total,
    deposit_percent,
    deposit_amount,
    balance_due,
    payment_status
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
    'draft',
    coalesce(v_notes, 'Booked online by customer — awaiting deposit'),
    v_daily_rate,
    v_days,
    v_quoted_total,
    v_deposit_percent,
    v_deposit_amount,
    v_balance_due,
    'unpaid'
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
  'Creates a draft public booking with quote snapshot; car is reserved only after deposit confirmation.';

create or replace function public.get_booking_payment_details(
  p_rental_id uuid,
  p_reference_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_row record;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.organization_id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at,
    r.quoted_daily_rate,
    r.quoted_days,
    r.quoted_total,
    r.deposit_percent,
    r.deposit_amount,
    r.balance_due,
    r.payment_status,
    r.payment_reference,
    r.payment_proof_path,
    r.payment_proof_submitted_at,
    v.name as vehicle_name,
    v.make as vehicle_make,
    v.model as vehicle_model,
    o.payment_qr_url,
    o.payment_instructions,
    o.name as organization_name
  into v_row
  from public.rentals r
  inner join public.vehicles v
    on v.id = r.vehicle_id
   and v.organization_id = r.organization_id
  inner join public.organizations o on o.id = r.organization_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
    and o.is_active
    and o.show_on_public_site;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'rental_id', v_row.id,
    'organization_id', v_row.organization_id,
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'start_at', v_row.start_at,
    'expected_return_at', v_row.expected_return_at,
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_total', v_row.quoted_total,
    'deposit_percent', v_row.deposit_percent,
    'deposit_amount', v_row.deposit_amount,
    'balance_due', v_row.balance_due,
    'payment_status', v_row.payment_status,
    'payment_reference', v_row.payment_reference,
    'has_payment_proof', v_row.payment_proof_path is not null,
    'payment_proof_submitted_at', v_row.payment_proof_submitted_at,
    'vehicle_name', v_row.vehicle_name,
    'vehicle_make', v_row.vehicle_make,
    'vehicle_model', v_row.vehicle_model,
    'payment_qr_url', v_row.payment_qr_url,
    'payment_instructions', v_row.payment_instructions,
    'organization_name', v_row.organization_name
  );
end;
$$;

revoke all on function public.get_booking_payment_details(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_booking_payment_details(uuid, text)
  to anon, authenticated;

create or replace function public.submit_booking_payment_proof(
  p_rental_id uuid,
  p_reference_number text,
  p_payment_reference text,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_pay_ref text := btrim(coalesce(p_payment_reference, ''));
  v_path text := btrim(coalesce(p_proof_path, ''));
  v_rental record;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;
  if char_length(v_pay_ref) not between 3 and 120 then
    raise exception 'Enter the GCash/Maya/bank reference number from your payment.'
      using errcode = '22023';
  end if;
  if char_length(v_path) < 8 or position('..' in v_path) > 0 then
    raise exception 'Payment screenshot is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.organization_id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount,
    r.vehicle_id,
    c.full_name as customer_name,
    c.phone_number as customer_phone,
    v.name as vehicle_name
  into v_rental
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
   and c.organization_id = r.organization_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
   and v.organization_id = r.organization_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
  for update of r;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  if v_rental.status <> 'draft' then
    raise exception 'This booking is already confirmed or closed.'
      using errcode = 'P0001';
  end if;

  if v_rental.payment_status in ('deposit_paid', 'paid_in_full') then
    raise exception 'Deposit for this booking was already confirmed.'
      using errcode = 'P0001';
  end if;

  if v_path not like (v_rental.organization_id::text || '/' || v_rental.id::text || '/%') then
    raise exception 'Invalid payment proof path.' using errcode = '22023';
  end if;

  update public.rentals
  set
    payment_reference = v_pay_ref,
    payment_proof_path = v_path,
    payment_proof_submitted_at = now(),
    payment_status = 'proof_submitted',
    notes = case
      when notes is null or notes = '' then 'Payment proof submitted by customer'
      when notes ilike '%payment proof%' then notes
      else notes || E'\nPayment proof submitted by customer'
    end
  where id = v_rental.id
    and organization_id = v_rental.organization_id;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'reference_number', v_rental.reference_number,
    'payment_status', 'proof_submitted',
    'deposit_amount', v_rental.deposit_amount,
    'customer_name', v_rental.customer_name,
    'customer_phone', v_rental.customer_phone,
    'vehicle_name', v_rental.vehicle_name,
    'payment_reference', v_pay_ref,
    'message', 'Payment proof received. We will confirm your reservation shortly.'
  );
end;
$$;

revoke all on function public.submit_booking_payment_proof(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_booking_payment_proof(uuid, text, text, text)
  to anon, authenticated;

create or replace function public.confirm_rental_deposit(p_rental_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental record;
begin
  if v_user_id is null or v_organization_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to confirm deposits.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;

  select
    r.id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount,
    r.vehicle_id,
    r.start_at,
    r.expected_return_at
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
    and r.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  if v_rental.status not in ('draft', 'reserved') then
    raise exception 'Only draft or reserved rentals can confirm a deposit.'
      using errcode = 'P0001';
  end if;

  update public.rentals
  set
    payment_status = 'deposit_paid',
    deposit_confirmed_at = coalesce(deposit_confirmed_at, now()),
    deposit_confirmed_by = coalesce(deposit_confirmed_by, v_user_id),
    balance_due = coalesce(quoted_total, 0) - coalesce(deposit_amount, 0)
  where id = v_rental.id
    and organization_id = v_organization_id;

  if v_rental.status = 'draft' then
    perform private.transition_rental_impl(
      v_rental.id,
      'reserved'::public.rental_status,
      null,
      null,
      null,
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'reference_number', v_rental.reference_number,
    'status', 'reserved',
    'payment_status', 'deposit_paid',
    'message', 'Deposit confirmed. Booking is now reserved.'
  );
end;
$$;

revoke all on function public.confirm_rental_deposit(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_rental_deposit(uuid)
  to authenticated;

-- Include draft + payment fields for signed-in customers.
drop function if exists public.list_my_bookings();

create or replace function public.list_my_bookings()
returns table (
  id uuid,
  reference_number text,
  status public.rental_status,
  payment_status public.rental_payment_status,
  start_at timestamptz,
  expected_return_at timestamptz,
  actual_return_at timestamptz,
  pickup_location text,
  return_location text,
  vehicle_id uuid,
  vehicle_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_photo_url text,
  quoted_total numeric,
  deposit_amount numeric,
  balance_due numeric,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_organization_id uuid;
begin
  if v_auth_uid is null then
    raise exception 'Sign in to view your bookings.' using errcode = '42501';
  end if;

  select nullif(lower(btrim(u.email)), '')
  into v_auth_email
  from auth.users u
  where u.id = v_auth_uid;

  if v_auth_email is null then
    return;
  end if;

  select p.organization_id
  into v_organization_id
  from public.profiles p
  where p.id = v_auth_uid
    and p.is_active;

  if v_organization_id is null then
    return;
  end if;

  return query
  select
    r.id,
    r.reference_number,
    r.status,
    r.payment_status,
    r.start_at,
    r.expected_return_at,
    r.actual_return_at,
    r.pickup_location,
    r.return_location,
    v.id,
    v.name,
    v.make,
    v.model,
    v.photo_url,
    r.quoted_total,
    r.deposit_amount,
    r.balance_due,
    r.created_at
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
   and c.organization_id = r.organization_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
   and v.organization_id = r.organization_id
  where r.organization_id = v_organization_id
    and lower(btrim(coalesce(c.email, ''))) = v_auth_email
  order by r.start_at desc, r.created_at desc;
end;
$$;

revoke all on function public.list_my_bookings()
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_bookings()
  to authenticated;

comment on function public.list_my_bookings() is
  'Returns rentals for the signed-in user, including draft bookings awaiting deposit.';
