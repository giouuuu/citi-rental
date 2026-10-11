-- ===========================================================================
-- record_past_rental: the owner enters a rental that already happened.
--
-- The normal flow (draft → reserved → active → completed) needs a pickup and
-- a return inspection done live, stamps the return as "now", and emails the
-- customer at each step. None of that fits history typed in after the fact.
-- This RPC saves the rental straight as completed, in one transaction:
--
--   * real times: booked at (created_at), pickup, agreed return, actual return
--   * the quote the app priced (same rent rules as a new rental) and the
--     driver fee
--   * the payment, dated when it was actually received, so collected revenue
--     and the finance statement land in the right period
--   * no inspections, no customer emails (the email trigger only fires on
--     reserved), an audit entry 'rental.recorded_past'
--
-- Owner/admin only. p_acknowledged must be true: the form shows a preview and
-- the owner ticks that the details are right before it can be saved.
-- The car must have no other booking overlapping the trip.
-- ===========================================================================

create or replace function public.record_past_rental(
  p_reference_number text,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_booked_at timestamptz,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_actual_return_at timestamptz,
  p_with_driver boolean,
  p_quoted_daily_rate numeric,
  p_quoted_half_day_rate numeric,
  p_quoted_hourly_rate numeric,
  p_quoted_days integer,
  p_quoted_hours integer,
  p_quoted_total numeric,
  p_driver_daily_rate numeric,
  p_driver_days integer,
  p_driver_fee numeric,
  p_pickup_location text,
  p_return_location text,
  p_destination text,
  p_starting_odometer numeric,
  p_ending_odometer numeric,
  p_notes text,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_reference text,
  p_paid_at timestamptz,
  p_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reference text := nullif(btrim(coalesce(p_reference_number, '')), '');
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_booked_at timestamptz := coalesce(p_booked_at, p_start_at);
  v_paid numeric(12, 2) := round(coalesce(p_amount_paid, 0), 2);
  v_total numeric(12, 2) := round(coalesce(p_quoted_total, 0), 2);
  v_payment_type public.payment_type;
  v_conflict record;
  v_rental_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Only owners and admins can record past rentals.'
      using errcode = '42501';
  end if;
  if p_acknowledged is not true then
    raise exception 'Review the preview and confirm the details before saving.'
      using errcode = '22023';
  end if;

  if v_reference is null or char_length(v_reference) > 60 then
    raise exception 'Enter a reference number (60 characters or fewer).'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'Select a customer.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id) then
    raise exception 'Select a car.' using errcode = '22023';
  end if;

  if p_start_at is null or p_expected_return_at is null or p_actual_return_at is null then
    raise exception 'Enter the pickup, agreed return, and actual return times.'
      using errcode = '22023';
  end if;
  if p_expected_return_at <= p_start_at then
    raise exception 'The agreed return must be after the pickup.' using errcode = '22023';
  end if;
  if p_actual_return_at <= p_start_at then
    raise exception 'The actual return must be after the pickup.' using errcode = '22023';
  end if;
  if p_actual_return_at > now() then
    raise exception 'The car must already be back. For a car still out, use New rental.'
      using errcode = '22023';
  end if;
  if v_booked_at > p_start_at then
    raise exception 'The booking date cannot be after the pickup.' using errcode = '22023';
  end if;

  if v_total < 0 or coalesce(p_driver_fee, 0) < 0 then
    raise exception 'Amounts cannot be negative.' using errcode = '22023';
  end if;
  if v_paid < 0 then
    raise exception 'The amount paid cannot be negative.' using errcode = '22023';
  end if;
  if v_paid > v_total then
    raise exception 'The amount paid is more than the total charged.' using errcode = '22023';
  end if;
  if v_paid > 0 then
    if v_method is null or v_method not in ('gcash', 'maya', 'bank', 'cash', 'other') then
      raise exception 'Choose how the customer paid.' using errcode = '22023';
    end if;
    if p_paid_at is null or p_paid_at > now() then
      raise exception 'Enter when the payment was received (not in the future).'
        using errcode = '22023';
    end if;
  end if;

  if p_starting_odometer is not null and p_ending_odometer is not null
    and p_ending_odometer < p_starting_odometer then
    raise exception 'The ending odometer cannot be lower than the starting one.'
      using errcode = '22023';
  end if;

  -- The car cannot have been out on another rental at the same time.
  perform 1 from public.vehicles v where v.id = p_vehicle_id for update;
  select r.reference_number, r.status, r.start_at,
    private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at) as end_at
  into v_conflict
  from public.rentals r
  where r.vehicle_id = p_vehicle_id
    and r.status <> 'cancelled'
    and (r.status <> 'draft' or private.rental_holds_dates(r.status, r.payment_status))
    and r.start_at < p_actual_return_at
    and private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at) > p_start_at
  order by r.start_at
  limit 1;
  if found then
    raise exception
      'This vehicle is already booked (% · %) from % to %. Check the dates or the car.',
      v_conflict.reference_number,
      v_conflict.status,
      to_char(v_conflict.start_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM'),
      to_char(v_conflict.end_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
      using errcode = '23P01';
  end if;

  if v_paid > 0 then
    -- Paid in full settles the balance; anything less is the down payment.
    v_payment_type := case when v_paid >= v_total then 'balance' else 'deposit' end;
  end if;

  insert into public.rentals (
    reference_number, customer_id, vehicle_id,
    start_at, expected_return_at, actual_return_at,
    pickup_location, return_location, destination,
    starting_odometer, ending_odometer,
    status, booking_source, notes, created_by, created_at,
    quoted_daily_rate, quoted_half_day_rate, quoted_hourly_rate,
    quoted_days, quoted_hours, quoted_total,
    with_driver, driver_daily_rate, driver_days, driver_fee,
    deposit_confirmed_at, deposit_confirmed_by
  ) values (
    v_reference, p_customer_id, p_vehicle_id,
    p_start_at, p_expected_return_at, p_actual_return_at,
    nullif(btrim(coalesce(p_pickup_location, '')), ''),
    nullif(btrim(coalesce(p_return_location, '')), ''),
    nullif(btrim(coalesce(p_destination, '')), ''),
    p_starting_odometer, p_ending_odometer,
    'completed', 'ops', nullif(btrim(coalesce(p_notes, '')), ''), v_user_id, v_booked_at,
    p_quoted_daily_rate, p_quoted_half_day_rate, p_quoted_hourly_rate,
    p_quoted_days, p_quoted_hours, v_total,
    coalesce(p_with_driver, false),
    case when coalesce(p_with_driver, false) then p_driver_daily_rate end,
    case when coalesce(p_with_driver, false) then p_driver_days end,
    case when coalesce(p_with_driver, false) then round(coalesce(p_driver_fee, 0), 2) else 0 end,
    case when v_payment_type = 'deposit' then p_paid_at end,
    case when v_payment_type = 'deposit' then v_user_id end
  )
  returning id into v_rental_id;

  if v_paid > 0 then
    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, notes, submitted_at, confirmed_at, confirmed_by
    ) values (
      v_rental_id, v_payment_type, v_paid, 'PHP', v_method, 'confirmed',
      nullif(btrim(coalesce(p_payment_reference, '')), ''),
      'Recorded with a past rental', p_paid_at, p_paid_at, v_user_id
    );
  end if;

  perform private.refresh_rental_payment_summary(v_rental_id);

  perform private.write_audit_log(
    'rental.recorded_past',
    'rental',
    v_rental_id,
    null,
    jsonb_build_object(
      'status', 'completed',
      'start_at', p_start_at,
      'expected_return_at', p_expected_return_at,
      'actual_return_at', p_actual_return_at,
      'quoted_total', v_total,
      'amount_paid', v_paid,
      'paid_at', case when v_paid > 0 then p_paid_at end
    ),
    jsonb_build_object('source', 'past_rental_form', 'acknowledged', true)
  );

  return v_rental_id;
end;
$$;

revoke all on function public.record_past_rental(
  text, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, boolean,
  numeric, numeric, numeric, integer, integer, numeric, numeric, integer, numeric,
  text, text, text, numeric, numeric, text, numeric, text, text, timestamptz, boolean
) from public, anon;
grant execute on function public.record_past_rental(
  text, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, boolean,
  numeric, numeric, numeric, integer, integer, numeric, numeric, integer, numeric,
  text, text, text, numeric, numeric, text, numeric, text, text, timestamptz, boolean
) to authenticated;
