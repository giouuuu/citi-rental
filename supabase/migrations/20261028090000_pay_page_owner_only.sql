-- ===========================================================================
-- The pay page belongs to the booking's owner, not to whoever holds the link.
--
-- /book/pay/<rental id>?ref=<reference> used to work signed out: the rental
-- id + reference pair was the only key, so a leaked link (screenshot, shared
-- device, forwarded message) let anyone read the booking and upload a payment
-- proof that holds the car's dates. Bookings now require sign-in
-- (bookings_require_sign_in), so every public booking has an owner.
--
-- 1. private.is_my_booking: same ownership rule as list_my_bookings and
--    cancel_my_booking (customer email = signed-in email, or the signed-in
--    user created the public_web booking).
-- 2. get_booking_payment_details: owner, or ops owner/admin (the Telegram
--    alert links ops to the pay page). No anon access.
-- 3. submit_booking_payment_proof: owner only. No anon access.
-- 4. payment-proofs uploads: signed-in owner, into their rental's folder.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Ownership
-- ---------------------------------------------------------------------------
create or replace function private.is_my_booking(p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rentals r
    inner join public.customers c
      on c.id = r.customer_id
    left join auth.users u
      on u.id = (select auth.uid())
    where r.id = p_rental_id
      and (select auth.uid()) is not null
      and (
        (
          nullif(lower(btrim(u.email)), '') is not null
          and lower(btrim(coalesce(c.email, ''))) = lower(btrim(u.email))
        )
        or (r.created_by = (select auth.uid()) and r.booking_source = 'public_web')
      )
  )
$$;

revoke all on function private.is_my_booking(uuid) from public, anon;
grant execute on function private.is_my_booking(uuid) to authenticated, service_role;

comment on function private.is_my_booking(uuid) is
  'True when the signed-in caller owns the rental (customer email match, or created the public_web booking). Never null.';

-- ---------------------------------------------------------------------------
-- 2. Pay page details
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

revoke all on function public.get_booking_payment_details(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_booking_payment_details(uuid, text)
  to authenticated;

comment on function public.get_booking_payment_details(uuid, text) is
  'Pay page details for the signed-in booking owner (or ops owner/admin).';

-- ---------------------------------------------------------------------------
-- 3. Payment proof
-- ---------------------------------------------------------------------------
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
  v_payment_id uuid;
  v_dates_taken boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to send your payment proof.' using errcode = '42501';
  end if;
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
  if not private.is_my_booking(p_rental_id) then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  select
    r.id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount,
    r.vehicle_id,
    r.start_at,
    r.expected_return_at,
    c.full_name as customer_name,
    c.phone_number as customer_phone,
    v.name as vehicle_name
  into v_rental
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
  for update of r, v;

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

  if v_path not like (v_rental.id::text || '/%') then
    raise exception 'Invalid payment proof path.' using errcode = '22023';
  end if;

  -- The vehicle row is locked above, so no other payment can slip in between.
  v_dates_taken := exists (
    select 1
    from private.rental_schedule_conflict(
      v_rental.vehicle_id, v_rental.start_at, v_rental.expected_return_at, v_rental.id
    )
  );

  -- Replace any previous unconfirmed deposit submission.
  update public.payments
  set
    status = 'cancelled',
    notes = coalesce(notes || E'\n', '') || 'Superseded by a newer proof upload',
    updated_at = now()
  where rental_id = v_rental.id
    and payment_type = 'deposit'
    and status = 'submitted';

  insert into public.payments (
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    proof_path,
    notes,
    submitted_at
  )
  values (
    v_rental.id,
    'deposit',
    greatest(coalesce(v_rental.deposit_amount, 0), 0.01),
    'PHP',
    null,
    'submitted',
    v_pay_ref,
    v_path,
    case
      when v_dates_taken
        then 'Customer uploaded deposit proof, but another booking already holds these dates — move dates or refund.'
      else 'Customer uploaded deposit proof'
    end,
    now()
  )
  returning id into v_payment_id;

  -- Holding the dates goes through the payment summary; skip it when they are taken.
  if not v_dates_taken then
    perform private.refresh_rental_payment_summary(v_rental.id);
  end if;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'reference_number', v_rental.reference_number,
    'payment_status', case when v_dates_taken then v_rental.payment_status else 'proof_submitted' end,
    'dates_taken', v_dates_taken,
    'deposit_amount', v_rental.deposit_amount,
    'customer_name', v_rental.customer_name,
    'customer_phone', v_rental.customer_phone,
    'vehicle_name', v_rental.vehicle_name,
    'payment_reference', v_pay_ref,
    'message', case
      when v_dates_taken
        then 'We received your payment, but another customer secured these dates first. We will contact you to move your dates or refund your payment.'
      else 'Payment received — these dates are now held for you. We will confirm your reservation shortly.'
    end
  );
end;
$$;

revoke all on function public.submit_booking_payment_proof(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_booking_payment_proof(uuid, text, text, text)
  to authenticated;

comment on function public.submit_booking_payment_proof(uuid, text, text, text) is
  'Signed-in booking owner submits deposit proof; creates a submitted payments ledger row.';

-- ---------------------------------------------------------------------------
-- 4. Proof uploads: owner only, into <rental id>/...
-- ---------------------------------------------------------------------------
drop policy if exists "payment_proofs_insert_public" on storage.objects;
drop policy if exists payment_proofs_insert_owner on storage.objects;
create policy payment_proofs_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  -- case, not and: Postgres may evaluate and-terms in any order, and the cast
  -- must not run on a folder that is not a uuid.
  and case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_my_booking(split_part(name, '/', 1)::uuid)
    else false
  end
);
