-- ===========================================================================
-- A car wash charged on every booking waives "return the car washed".
--
-- When the owner ticks "Add to every online booking" on the Car wash charge
-- type, the customer has already paid for the wash, so they are no longer
-- asked to return the car washed or warned of a wash fee at return.
--
-- 1. get_public_booking_fees: car_wash_fee only when the wash is charged at
--    return; car_wash_included when it is on every booking.
-- 2. get_booking_payment_details: car_wash_fee is null on a booking whose
--    fees already include the wash (bookings made before keep the note).
-- ===========================================================================

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
      where t.code = 'car_wash' and t.is_active and not t.add_to_bookings
    ),
    'car_wash_included', exists (
      select 1
      from public.rental_charge_types t
      where t.code = 'car_wash' and t.is_active and t.add_to_bookings
        and t.default_amount > 0
    ),
    'booking_fees', (
      select coalesce(jsonb_agg(line - 'charge_type_id'), '[]'::jsonb)
      from jsonb_array_elements(private.booking_fee_lines()) as line
    )
  )
  from public.company_profile c
  limit 1;
$$;

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
    -- Null when this booking already pays for the wash up front.
    (
      select t.default_amount
      from public.rental_charge_types t
      where t.code = 'car_wash' and t.is_active
        and not exists (
          select 1 from jsonb_array_elements(r.booking_fees) as fee
          where fee ->> 'charge_type_id' = t.id::text
        )
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
