-- ===========================================================================
-- Customer booking details, reviews after a trip, and rentals that need
-- attention.
--
-- 1. customer_reviews.rental_id / rating, and a 'website' source: a renter
--    rates a completed trip from their account. One review per booking; it
--    lands hidden so the owner publishes it from the Reviews page.
-- 2. get_my_booking: everything one booking holds for its signed-in owner
--    (trip, quote, payments ledger, cancellation, their review).
-- 3. list_my_bookings gains has_review, for the account cards.
-- 4. submit_my_booking_review: the signed-in owner of a completed booking
--    rates it once.
-- 5. list_public_customer_reviews returns the rating for the homepage.
-- 6. list_rentals_needing_attention / rental_nav_counts: the ops to-do list on
--    /rentals and the live counts on the sidebar's Rentals item. Overdue is
--    derived from the clock, so the counts are right before the sweep runs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Reviews tied to bookings
-- ---------------------------------------------------------------------------
alter table public.customer_reviews
  add column rental_id uuid references public.rentals (id) on delete set null,
  add column rating smallint check (rating is null or rating between 1 and 5);

create unique index customer_reviews_rental_id_key
  on public.customer_reviews (rental_id)
  where rental_id is not null;

alter table public.customer_reviews
  drop constraint customer_reviews_source_check,
  add constraint customer_reviews_source_check
    check (source in ('facebook', 'google', 'direct', 'website', 'other'));

comment on column public.customer_reviews.rental_id is
  'The booking a renter reviewed from their account; null for reviews copied in by staff.';
comment on column public.customer_reviews.rating is
  'Stars, 1–5, from a renter''s own review; null for reviews copied in by staff.';

-- Shared ownership rule (same as list_my_bookings / cancel_my_booking): the
-- customer's email is the account's, or this account booked it online.
create or replace function private.owns_booking(p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rentals r
    inner join public.customers c on c.id = r.customer_id
    cross join lateral (
      select nullif(lower(btrim(u.email)), '') as email
      from auth.users u
      where u.id = auth.uid()
    ) me
    where r.id = p_rental_id
      and auth.uid() is not null
      and (
        (me.email is not null and lower(btrim(coalesce(c.email, ''))) = me.email)
        or (r.created_by = auth.uid() and r.booking_source = 'public_web')
      )
  );
$$;

revoke all on function private.owns_booking(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owns_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One booking, in full, for its owner
-- ---------------------------------------------------------------------------
create function public.get_my_booking(p_rental_id uuid)
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
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your booking.' using errcode = '42501';
  end if;
  if p_rental_id is null or not private.owns_booking(p_rental_id) then
    return null;
  end if;

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
    c.email as customer_email
  into v_row
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  inner join public.customers c on c.id = r.customer_id
  where r.id = p_rental_id;

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
      'email', v_row.customer_email
    ),
    'payments', v_payments,
    'review', v_review
  );
end;
$function$;

revoke all on function public.get_my_booking(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_my_booking(uuid) to authenticated;

comment on function public.get_my_booking(uuid) is
  'One booking with its quote, payments and review, for the signed-in customer who owns it; null otherwise.';

-- ---------------------------------------------------------------------------
-- 3. Account cards know whether a trip was reviewed
-- ---------------------------------------------------------------------------
drop function public.list_my_bookings();

create function public.list_my_bookings()
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
  created_at timestamptz,
  has_review boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
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
  if not (select private.has_active_profile()) then
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
    r.created_at,
    exists (select 1 from public.customer_reviews cr where cr.rental_id = r.id)
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
  where lower(btrim(coalesce(c.email, ''))) = v_auth_email
     -- What this account booked online, even if staff filed it elsewhere.
     or (r.created_by = v_auth_uid and r.booking_source = 'public_web')
  order by r.start_at desc, r.created_at desc;
end;
$function$;

revoke all on function public.list_my_bookings() from public, anon, authenticated, service_role;
grant execute on function public.list_my_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rate a completed trip
-- ---------------------------------------------------------------------------
create function public.submit_my_booking_review(
  p_rental_id uuid,
  p_rating integer,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_rental record;
  v_parts text[];
  v_display_name text;
  v_review_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to review your trip.' using errcode = '42501';
  end if;
  if p_rental_id is null or not private.owns_booking(p_rental_id) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars.' using errcode = '22023';
  end if;
  if v_body is null or char_length(v_body) < 3 then
    raise exception 'Tell us a little about your trip.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep your review under 2,000 characters.' using errcode = '22023';
  end if;

  select r.id, r.reference_number, r.status, v.name as vehicle_name, c.full_name
  into v_rental
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  inner join public.customers c on c.id = r.customer_id
  where r.id = p_rental_id;

  if v_rental.status <> 'completed' then
    raise exception 'You can review your trip once the car is returned.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.customer_reviews cr where cr.rental_id = p_rental_id) then
    raise exception 'You already reviewed this trip. Thank you!' using errcode = 'P0001';
  end if;

  -- Shown publicly as first name and last initial ("Juan D.").
  v_parts := regexp_split_to_array(btrim(coalesce(v_rental.full_name, '')), '\s+');
  v_display_name := case
    when coalesce(v_parts[1], '') = '' then 'Zeke renter'
    when array_length(v_parts, 1) = 1 then v_parts[1]
    else v_parts[1] || ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.'
  end;

  insert into public.customer_reviews (
    reviewer_name, body, vehicle_label, source, reviewed_on, is_hidden,
    sort_order, created_by, rental_id, rating
  )
  values (
    left(v_display_name, 120),
    v_body,
    nullif(left(btrim(coalesce(v_rental.vehicle_name, '')), 120), ''),
    'website',
    timezone('Asia/Manila', now())::date,
    -- The owner publishes it from the Reviews page.
    true,
    0,
    auth.uid(),
    p_rental_id,
    p_rating
  )
  returning id into v_review_id;

  return jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'rental_id', p_rental_id,
    'reference_number', v_rental.reference_number,
    'vehicle_name', v_rental.vehicle_name,
    'reviewer_name', v_display_name,
    'rating', p_rating
  );
exception
  when unique_violation then
    raise exception 'You already reviewed this trip. Thank you!' using errcode = 'P0001';
end;
$function$;

revoke all on function public.submit_my_booking_review(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_my_booking_review(uuid, integer, text) to authenticated;

comment on function public.submit_my_booking_review(uuid, integer, text) is
  'The signed-in owner of a completed booking rates it once. Saved hidden until the owner publishes it.';

-- ---------------------------------------------------------------------------
-- 5. Homepage reviews carry their stars
-- ---------------------------------------------------------------------------
drop function public.list_public_customer_reviews();

create function public.list_public_customer_reviews()
returns table (
  id uuid,
  reviewer_name text,
  body text,
  photo_url text,
  vehicle_label text,
  source text,
  reviewed_on date,
  rating smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.reviewer_name, r.body, r.photo_url, r.vehicle_label, r.source, r.reviewed_on, r.rating
  from public.customer_reviews r
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and not r.is_hidden
  order by r.sort_order asc, r.created_at desc
  limit 60;
$$;

revoke all on function public.list_public_customer_reviews()
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_customer_reviews() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rentals that need someone to act, and the sidebar counts
-- ---------------------------------------------------------------------------
-- One row per rental, under its most pressing reason:
--   overdue         out past its expected return
--   proof_to_check  a draft whose reservation-fee proof waits on staff
--   late_pickup     reserved, pickup time passed, car never went out
--   refund_due      cancelled holding more than the policy lets the business keep
--   balance_due     returned with part of the bill unpaid
-- Security invoker: rentals RLS (staff only) applies.
create function public.list_rentals_needing_attention()
returns table (
  id uuid,
  reference_number text,
  reason text,
  due_at timestamptz,
  status public.rental_status,
  payment_status public.rental_payment_status,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  vehicle_id uuid,
  vehicle_plate text,
  vehicle_name text,
  start_at timestamptz,
  expected_return_at timestamptz,
  bill_total numeric,
  amount_paid numeric,
  bill_balance numeric
)
language sql
stable
set search_path = ''
as $$
  with billed as (
    select
      r.*,
      public.bill_total(r) as bill_total_amount,
      public.amount_paid(r) as amount_paid_amount
    from public.rentals r
  ),
  flagged as (
    select
      b.*,
      greatest(0, b.bill_total_amount - b.amount_paid_amount) as bill_balance_amount,
      case
        when b.status = 'overdue'
          or (b.status = 'active' and b.expected_return_at < now()) then 'overdue'
        when b.status = 'draft' and (
          b.payment_status = 'proof_submitted'
          or exists (
            select 1 from public.payments p
            where p.rental_id = b.id
              and p.payment_type = 'deposit'
              and p.status = 'submitted'
          )
        ) then 'proof_to_check'
        when b.status = 'reserved' and b.start_at < now() then 'late_pickup'
        -- A forfeited fee is kept; anything paid beyond it goes back.
        when b.status = 'cancelled'
          and b.amount_paid_amount > case
            when coalesce(b.reservation_fee_forfeited, false)
              then coalesce(b.deposit_amount, 0)
            else 0
          end then 'refund_due'
        when b.status = 'completed'
          and b.bill_total_amount - b.amount_paid_amount > 0 then 'balance_due'
      end as reason
    from billed b
  )
  select
    f.id,
    f.reference_number,
    f.reason,
    case f.reason
      when 'overdue' then f.expected_return_at
      when 'refund_due' then coalesce(f.cancelled_at, f.updated_at)
      when 'balance_due' then coalesce(f.actual_return_at, f.expected_return_at)
      else f.start_at
    end as due_at,
    f.status,
    f.payment_status,
    c.id,
    c.full_name,
    c.phone_number,
    v.id,
    v.plate_number,
    v.name,
    f.start_at,
    f.expected_return_at,
    f.bill_total_amount,
    f.amount_paid_amount,
    f.bill_balance_amount
  from flagged f
  inner join public.customers c on c.id = f.customer_id
  inner join public.vehicles v on v.id = f.vehicle_id
  where f.reason is not null
  order by
    array_position(
      array['overdue', 'proof_to_check', 'late_pickup', 'refund_due', 'balance_due'],
      f.reason
    ),
    due_at asc;
$$;

revoke all on function public.list_rentals_needing_attention() from public, anon;
grant execute on function public.list_rentals_needing_attention() to authenticated;

comment on function public.list_rentals_needing_attention() is
  'Ops to-do list for /rentals: overdue, proof to check, late pickup, refund due, balance due. Staff only via rentals RLS.';

create function public.rental_nav_counts()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'active', (
      select count(*) from public.rentals r
      where r.status in ('active', 'overdue')
    ),
    'needs_action', (select count(*) from public.list_rentals_needing_attention())
  );
$$;

revoke all on function public.rental_nav_counts() from public, anon;
grant execute on function public.rental_nav_counts() to authenticated;

comment on function public.rental_nav_counts() is
  'Sidebar counts: rentals out now (active + overdue) and rentals needing attention.';
