-- A booking holds the car's dates the moment the customer sends the
-- reservation fee (proof upload or PayMongo), not only once staff confirm it.
-- Unpaid drafts still hold nothing. The first payment in wins: a later payment
-- for dates already held is recorded for refund but never holds the car.

create or replace function private.rental_holds_dates(
  p_status public.rental_status,
  p_payment_status public.rental_payment_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('reserved', 'active', 'overdue')
    or (
      p_status = 'draft'
      and p_payment_status in ('proof_submitted', 'deposit_paid', 'paid_in_full')
    );
$$;

comment on function private.rental_holds_dates(public.rental_status, public.rental_payment_status) is
  'True when a rental blocks its vehicle''s dates: reserved/active/overdue, or a draft whose reservation fee was sent.';

revoke all on function private.rental_holds_dates(public.rental_status, public.rental_payment_status)
  from public, anon, authenticated;

create or replace function private.rental_schedule_conflict(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_exclude_rental_id uuid default null
)
returns table (
  rental_id uuid,
  reference_number text,
  status public.rental_status,
  start_at timestamptz,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at
  from public.rentals r
  where r.vehicle_id = p_vehicle_id
    and private.rental_holds_dates(r.status, r.payment_status)
    and (p_exclude_rental_id is null or r.id <> p_exclude_rental_id)
    and tstzrange(r.start_at, r.expected_return_at, '[)')
      && tstzrange(p_start_at, p_expected_return_at, '[)')
  order by r.start_at
  limit 1;
$$;

create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric, color text,
  showcase_image_url text, half_day_rate numeric, hourly_rate numeric
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
          and private.rental_holds_dates(r.status, r.payment_status)
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

create or replace function public.list_public_vehicle_booked_ranges(p_vehicle_id uuid)
returns table (start_at timestamptz, expected_return_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.start_at, r.expected_return_at
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.vehicle_id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive'
    and private.rental_holds_dates(r.status, r.payment_status)
    and r.expected_return_at > now()
  order by r.start_at asc;
$$;

-- The clash check now runs only when the row could newly overlap: insert, a
-- change of car/dates/status, or a draft starting to hold. Otherwise an unpaid
-- draft whose dates someone else paid for could not even have its notes edited.
create or replace function private.validate_rental_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_blocked boolean;
  v_customer_consent timestamptz;
  v_vehicle_status public.vehicle_status;
  v_conflict record;
  v_check_clash boolean;
begin
  if new.expected_return_at <= new.start_at then
    raise exception 'Expected return must be after the rental start.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
    ) then
      raise exception 'Customer and vehicle cannot change after a rental leaves draft.'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('reserved', 'active', 'cancelled'))
      or (old.status = 'reserved' and new.status in ('active', 'cancelled', 'overdue'))
      or (old.status = 'active' and new.status in ('completed', 'cancelled', 'overdue'))
      or (old.status = 'overdue' and new.status in ('completed', 'cancelled'))
      or (old.status = 'overdue' and new.status = 'active' and new.expected_return_at > now())
    ) then
      raise exception 'Invalid rental status transition from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if old.status in ('completed', 'cancelled') and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.start_at is distinct from old.start_at
      or new.expected_return_at is distinct from old.expected_return_at
      or new.status is distinct from old.status
    ) then
      raise exception 'Completed or cancelled rentals cannot change vehicle, customer, schedule, or status.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Lock the vehicle row so concurrent booking attempts serialize on the same car.
  if new.status in ('draft', 'reserved', 'active', 'overdue') then
    select v.status into v_vehicle_status
    from public.vehicles v
    where v.id = new.vehicle_id
    for update;

    if v_vehicle_status is null then
      raise exception 'The selected vehicle was not found.'
        using errcode = 'foreign_key_violation';
    end if;

    if v_vehicle_status in ('maintenance', 'inactive') then
      raise exception
        'Vehicle is % and cannot be booked. Choose an available vehicle.',
        v_vehicle_status
        using errcode = 'check_violation';
    end if;

    v_check_clash := tg_op = 'INSERT';
    if not v_check_clash then
      v_check_clash :=
        new.vehicle_id is distinct from old.vehicle_id
        or new.start_at is distinct from old.start_at
        or new.expected_return_at is distinct from old.expected_return_at
        or new.status is distinct from old.status
        or (
          private.rental_holds_dates(new.status, new.payment_status)
          and not private.rental_holds_dates(old.status, old.payment_status)
        );
    end if;

    if v_check_clash then
      select * into v_conflict
      from private.rental_schedule_conflict(new.vehicle_id,
        new.start_at,
        new.expected_return_at,
        case when tg_op = 'UPDATE' then new.id else null end
      );

      if found then
        raise exception
          'This vehicle is already booked (% · %) from % to %. Pick another car or different dates.',
          v_conflict.reference_number,
          v_conflict.status,
          v_conflict.start_at,
          v_conflict.expected_return_at
          using errcode = 'exclusion_violation';
      end if;
    end if;
  end if;

  if new.status in ('reserved', 'active', 'overdue') then
    select c.is_blocked, c.tracking_consent_at
      into v_customer_blocked, v_customer_consent
    from public.customers c
    where c.id = new.customer_id
    for update;

    if coalesce(v_customer_blocked, true) then
      raise exception 'Blocked customers cannot reserve or start rentals.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status in ('active', 'overdue')
    and coalesce(new.tracking_consent_at, v_customer_consent) is null then
    raise exception 'GPS tracking consent is required before a rental can start.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'completed' and new.actual_return_at is null then
    new.actual_return_at := now();
  end if;
  if new.status <> 'completed' and new.ending_odometer is not null then
    raise exception 'Ending odometer may only be recorded for a completed rental.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- The pay page warns before the customer sends money for dates already held.
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
$$;

-- Proof upload: the screenshot means money was already sent, so it is always
-- recorded. If someone else already holds the dates it is kept for refund and
-- the booking does not hold the car.
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

-- Don't open a PayMongo checkout for dates someone else already holds.
create or replace function public.record_paymongo_checkout(
  p_rental_id uuid,
  p_reference_number text,
  p_checkout_session_id text,
  p_amount numeric,
  p_livemode boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental record;
  v_id uuid;
begin
  select r.id, r.status, r.payment_status, r.deposit_amount,
    r.vehicle_id, r.start_at, r.expected_return_at
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
    and r.reference_number = btrim(coalesce(p_reference_number, ''))
  for update;

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
  if p_amount is distinct from v_rental.deposit_amount then
    raise exception 'Checkout amount does not match the booking deposit.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from private.rental_schedule_conflict(
      v_rental.vehicle_id, v_rental.start_at, v_rental.expected_return_at, v_rental.id
    )
  ) then
    raise exception 'Another customer just secured these dates. Pick different dates or another car — you have not been charged.'
      using errcode = 'P0001';
  end if;

  -- A newer session replaces any unpaid one for the same booking.
  update public.paymongo_checkouts
  set status = 'expired', updated_at = now()
  where rental_id = v_rental.id
    and status = 'pending';

  insert into public.paymongo_checkouts (
    rental_id, checkout_session_id, amount, livemode
  )
  values (
    v_rental.id, p_checkout_session_id, p_amount, coalesce(p_livemode, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- PayMongo money is already taken, so the payment is always recorded. If
-- another booking claimed the dates while the customer was on the checkout
-- page, the payment is kept for refund and does not hold the car.
create or replace function public.apply_paymongo_checkout_paid(
  p_event_id text,
  p_checkout_session_id text,
  p_paymongo_payment_id text,
  p_amount_centavos bigint,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.paymongo_checkouts%rowtype;
  v_rental_status public.rental_status;
  v_reference text;
  v_vehicle_id uuid;
  v_start_at timestamptz;
  v_expected_return_at timestamptz;
  v_customer_name text;
  v_customer_phone text;
  v_vehicle_name text;
  v_conflict_reference text;
  v_dates_taken boolean := false;
  v_payment_id uuid;
  v_result text;
begin
  if nullif(btrim(coalesce(p_event_id, '')), '') is null then
    raise exception 'PayMongo event id is required.' using errcode = '22023';
  end if;

  -- Replays of an event we already handled are acknowledged, not re-applied.
  insert into private.paymongo_webhook_events (event_id, event_type, result)
  values (p_event_id, 'checkout_session.payment.paid', 'processing')
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into v_checkout
  from public.paymongo_checkouts c
  where c.checkout_session_id = p_checkout_session_id
  for update;

  if not found then
    v_result := 'unknown_checkout';
  elsif v_checkout.livemode is distinct from coalesce(p_livemode, false) then
    v_result := 'mode_mismatch';
  elsif v_checkout.status = 'paid' then
    v_result := 'already_paid';
  elsif coalesce(p_amount_centavos, 0) < round(v_checkout.amount * 100) then
    v_result := 'amount_mismatch';
  else
    select r.status, r.reference_number, r.vehicle_id, r.start_at, r.expected_return_at,
      c.full_name, c.phone_number, v.name
    into v_rental_status, v_reference, v_vehicle_id, v_start_at, v_expected_return_at,
      v_customer_name, v_customer_phone, v_vehicle_name
    from public.rentals r
    join public.customers c on c.id = r.customer_id
    join public.vehicles v on v.id = r.vehicle_id
    where r.id = v_checkout.rental_id
    for update of r, v;

    if v_rental_status = 'draft' then
      select c.reference_number into v_conflict_reference
      from private.rental_schedule_conflict(
        v_vehicle_id, v_start_at, v_expected_return_at, v_checkout.rental_id
      ) c;
      v_dates_taken := found;
    end if;

    -- Supersede any manual proof still waiting; PayMongo's is authoritative.
    update public.payments
    set status = 'cancelled',
        notes = coalesce(notes || E'\n', '') || 'Superseded by a PayMongo payment',
        updated_at = now()
    where rental_id = v_checkout.rental_id
      and payment_type = 'deposit'
      and status = 'submitted';

    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, notes, submitted_at
    )
    values (
      v_checkout.rental_id,
      'deposit',
      v_checkout.amount,
      'PHP',
      'paymongo',
      'submitted',
      left(p_paymongo_payment_id, 120),
      case
        when v_dates_taken
          then 'Paid online via PayMongo, but ' || v_conflict_reference
            || ' already holds these dates — move dates or refund.'
        when v_rental_status = 'draft'
          then 'Paid online via PayMongo (verified). Dates are held; confirm the deposit to reserve.'
        else 'Paid online via PayMongo after the booking was '
          || v_rental_status || ' — review for refund.'
      end,
      now()
    )
    returning id into v_payment_id;

    update public.paymongo_checkouts
    set status = 'paid',
        paymongo_payment_id = p_paymongo_payment_id,
        payment_id = v_payment_id,
        paid_at = now(),
        updated_at = now()
    where id = v_checkout.id;

    -- Holding the dates goes through the payment summary; skip it when they are taken.
    if not v_dates_taken then
      perform private.refresh_rental_payment_summary(v_checkout.rental_id);
    end if;
    v_result := case
      when v_dates_taken then 'recorded_conflict'
      when v_rental_status = 'draft' then 'recorded'
      else 'recorded_closed'
    end;
  end if;

  update private.paymongo_webhook_events
  set result = v_result
  where event_id = p_event_id;

  return jsonb_build_object(
    'result', v_result,
    'rental_id', v_checkout.rental_id,
    'reference_number', v_reference,
    'conflict_reference_number', v_conflict_reference,
    'amount', v_checkout.amount,
    'customer_name', v_customer_name,
    'customer_phone', v_customer_phone,
    'vehicle_name', v_vehicle_name
  );
end;
$$;
