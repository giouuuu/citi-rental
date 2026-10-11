-- ===========================================================================
-- The customer can pay after the booking is reserved, and pay an open bill.
--
-- Until now the pay page only took the reservation fee on a draft. A booking
-- the owner reserved without payment (a repeat customer, say) could not be
-- paid online, and neither could a balance or a charge added at return.
--
-- 1. private.customer_payment_kind: what the renter may send right now.
--    'reservation_fee' — a draft, or a reserved booking with nothing paid yet
--    and a fee asked; 'open_bill' — reserved/active/overdue/completed with a
--    balance left; null — nothing to pay.
-- 2. submit_booking_payment_proof takes p_amount: the fee as before, or any
--    amount up to the open balance less payments still being checked. Bill
--    payments are 'balance' rows waiting for staff.
-- 3. review_customer_payment: staff confirm or reject a customer's bill
--    payment. Reservation fees keep confirm_rental_deposit.
-- 4. get_booking_payment_details returns the kind and the bill totals.
-- 5. list_rentals_needing_attention flags any payment waiting to be checked.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. What the renter may pay
-- ---------------------------------------------------------------------------
create or replace function private.customer_payment_kind(p_rental public.rentals)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_rental.status = 'draft'
      and p_rental.payment_status not in ('deposit_paid', 'paid_in_full', 'refunded')
      then 'reservation_fee'
    -- Reserved by staff before any money came in: the fee still comes first.
    when p_rental.status = 'reserved'
      and coalesce(p_rental.deposit_amount, 0) > 0
      and p_rental.payment_status in ('unpaid', 'proof_submitted')
      and public.amount_paid(p_rental) = 0
      then 'reservation_fee'
    when p_rental.status in ('reserved', 'active', 'overdue', 'completed')
      and public.bill_total(p_rental) - public.amount_paid(p_rental) > 0
      then 'open_bill'
  end;
$$;

revoke all on function private.customer_payment_kind(public.rentals)
  from public, anon, authenticated;

comment on function private.customer_payment_kind(public.rentals) is
  'What the renter may pay now: reservation_fee, open_bill, or null. Mirrored by bookingPaymentStep in TS.';

-- ---------------------------------------------------------------------------
-- 2. Payment proof: reservation fee or open bill
-- ---------------------------------------------------------------------------
drop function if exists public.submit_booking_payment_proof(uuid, text, text, text);

create or replace function public.submit_booking_payment_proof(
  p_rental_id uuid,
  p_reference_number text,
  p_payment_reference text,
  p_proof_path text,
  p_amount numeric default null
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
  v_rental public.rentals%rowtype;
  v_kind text;
  v_amount numeric(12, 2);
  v_open numeric(12, 2);
  v_pending numeric(12, 2);
  v_payable numeric(12, 2);
  v_payment_id uuid;
  v_dates_taken boolean := false;
  v_customer_name text;
  v_customer_phone text;
  v_vehicle_name text;
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

  select r.*
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
    and r.reference_number = v_ref
  for update;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  if v_path not like (v_rental.id::text || '/%') then
    raise exception 'Invalid payment proof path.' using errcode = '22023';
  end if;

  v_kind := private.customer_payment_kind(v_rental);

  if v_kind is null then
    raise exception '%', case
      when v_rental.status = 'cancelled' then 'This booking is cancelled.'
      else 'Nothing is left to pay on this booking.'
    end
      using errcode = 'P0001';
  end if;

  select c.full_name, c.phone_number, v.name
  into v_customer_name, v_customer_phone, v_vehicle_name
  from public.customers c
  cross join public.vehicles v
  where c.id = v_rental.customer_id
    and v.id = v_rental.vehicle_id;

  if v_kind = 'reservation_fee' then
    v_amount := greatest(coalesce(v_rental.deposit_amount, 0), 0.01);

    -- A draft only holds its dates once paid; a reserved booking already does.
    if v_rental.status = 'draft' then
      -- Lock the car so no other payment slips in between.
      perform 1 from public.vehicles v where v.id = v_rental.vehicle_id for update;
      v_dates_taken := exists (
        select 1
        from private.rental_schedule_conflict(
          v_rental.vehicle_id, v_rental.start_at, v_rental.expected_return_at, v_rental.id
        )
      );
    end if;

    -- Replace any previous unconfirmed fee submission.
    update public.payments
    set
      status = 'cancelled',
      notes = coalesce(notes || E'\n', '') || 'Superseded by a newer proof upload',
      updated_at = now()
    where rental_id = v_rental.id
      and payment_type = 'deposit'
      and status = 'submitted';

    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, proof_path, notes, submitted_at
    )
    values (
      v_rental.id,
      'deposit',
      v_amount,
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
  else
    v_open := greatest(0, public.bill_total(v_rental) - public.amount_paid(v_rental));
    select coalesce(sum(p.amount), 0)
    into v_pending
    from public.payments p
    where p.rental_id = v_rental.id
      and p.payment_type = 'balance'
      and p.status = 'submitted';
    v_payable := round(v_open - v_pending, 2);

    if v_payable <= 0 then
      raise exception 'Your last payment is still being checked. It covers the open balance.'
        using errcode = 'P0001';
    end if;

    v_amount := round(coalesce(p_amount, 0), 2);
    if v_amount <= 0 then
      raise exception 'Enter the amount you sent.' using errcode = '22023';
    end if;
    if v_amount > v_payable then
      raise exception 'You can pay up to ₱% on this booking.',
        to_char(v_payable, 'FM999,999,990.00')
        using errcode = '22023';
    end if;

    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, proof_path, notes, submitted_at
    )
    values (
      v_rental.id,
      'balance',
      v_amount,
      'PHP',
      null,
      'submitted',
      v_pay_ref,
      v_path,
      'Customer uploaded payment proof for the open bill',
      now()
    )
    returning id into v_payment_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'payment_kind', v_kind,
    'amount', v_amount,
    'reference_number', v_rental.reference_number,
    'payment_status', case
      when v_kind = 'reservation_fee' and not v_dates_taken then 'proof_submitted'
      else v_rental.payment_status::text
    end,
    'dates_taken', v_dates_taken,
    'deposit_amount', v_rental.deposit_amount,
    'customer_name', v_customer_name,
    'customer_phone', v_customer_phone,
    'vehicle_name', v_vehicle_name,
    'payment_reference', v_pay_ref,
    'message', case
      when v_dates_taken
        then 'We received your payment, but another customer secured these dates first. We will contact you to move your dates or refund your payment.'
      when v_kind = 'open_bill'
        then 'Payment received. We will check it and update your bill shortly.'
      when v_rental.status = 'reserved'
        then 'Payment received. We will confirm your reservation fee shortly.'
      else 'Payment received — these dates are now held for you. We will confirm your reservation shortly.'
    end
  );
end;
$$;

revoke all on function public.submit_booking_payment_proof(uuid, text, text, text, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_booking_payment_proof(uuid, text, text, text, numeric)
  to authenticated;

comment on function public.submit_booking_payment_proof(uuid, text, text, text, numeric) is
  'Signed-in booking owner sends a payment proof: the reservation fee, or up to the open bill (p_amount).';

-- ---------------------------------------------------------------------------
-- 3. Staff confirm or reject a customer's bill payment
-- ---------------------------------------------------------------------------
create or replace function public.review_customer_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_payment record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to review payments.'
      using errcode = '42501';
  end if;
  if p_payment_id is null or p_approve is null then
    raise exception 'Select a payment.' using errcode = '22023';
  end if;

  select p.rental_id into v_rental_id
  from public.payments p
  where p.id = p_payment_id;

  if v_rental_id is null then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  -- Rental first, as refresh_rental_payment_summary locks it too.
  perform 1 from public.rentals r where r.id = v_rental_id for update;

  select p.id, p.payment_type, p.status, p.amount
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if v_payment.payment_type <> 'balance' or v_payment.status <> 'submitted' then
    raise exception 'This payment is no longer waiting for review. Refresh the page.'
      using errcode = 'P0001';
  end if;

  if p_approve then
    update public.payments
    set
      status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = v_user_id,
      updated_at = now()
    where id = v_payment.id;
  else
    update public.payments
    set
      status = 'rejected',
      notes = coalesce(notes || E'\n', '')
        || 'Rejected by staff' || coalesce(': ' || v_reason, ''),
      updated_at = now()
    where id = v_payment.id;
  end if;

  perform private.refresh_rental_payment_summary(v_rental_id);

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'rental_id', v_rental_id,
    'status', case when p_approve then 'confirmed' else 'rejected' end
  );
end;
$$;

revoke all on function public.review_customer_payment(uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_customer_payment(uuid, boolean, text)
  to authenticated;

comment on function public.review_customer_payment(uuid, boolean, text) is
  'Staff confirm or reject a customer''s submitted bill payment (balance row).';

-- ---------------------------------------------------------------------------
-- 4. Pay page details: what may be paid, and the bill so far
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

-- ---------------------------------------------------------------------------
-- 5. Needs attention: any customer payment waiting to be checked
-- ---------------------------------------------------------------------------
create or replace function public.list_rentals_needing_attention()
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
set search_path to ''
as $function$
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
        when b.status <> 'cancelled' and (
          (b.status = 'draft' and b.payment_status = 'proof_submitted')
          or exists (
            select 1 from public.payments p
            where p.rental_id = b.id
              and p.payment_type in ('deposit', 'balance')
              and p.status = 'submitted'
          )
        ) then 'proof_to_check'
        when b.status = 'reserved' and b.start_at < now() then 'late_pickup'
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
$function$;
