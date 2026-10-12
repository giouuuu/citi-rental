-- ===========================================================================
-- At the reservation step the renter says how much they sent.
--
-- The pay page only ever recorded the reservation fee (deposit_amount), so a
-- renter who paid the whole trip up front showed ₱1,000 paid and the rest
-- still owed, and the owner had to record the difference by hand. Now
-- submit_booking_payment_proof takes p_amount on the reservation step too:
-- at least the fee, at most what is left of the bill. No amount still means
-- the fee, for a pay page loaded before this. Confirming it goes through
-- refresh_rental_payment_summary as before, so a full payment reads
-- paid_in_full with nothing due.
--
-- Otherwise as 20261113090000_customer_pays_open_bill left it.
-- ===========================================================================

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
  v_fee numeric(12, 2);
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
    -- The renter says what they sent: the fee at least, the whole trip at most.
    -- No amount (a pay page from before this) means the fee.
    v_fee := greatest(coalesce(v_rental.deposit_amount, 0), 0.01);
    v_payable := greatest(
      round(public.bill_total(v_rental) - public.amount_paid(v_rental), 2),
      v_fee
    );
    v_amount := round(coalesce(p_amount, v_fee), 2);
    if v_amount < v_fee then
      raise exception 'Send at least the ₱% reservation fee.',
        to_char(v_fee, 'FM999,999,990.00')
        using errcode = '22023';
    end if;
    if v_amount > v_payable then
      raise exception 'You can pay up to ₱% on this booking.',
        to_char(v_payable, 'FM999,999,990.00')
        using errcode = '22023';
    end if;

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
        when v_amount > v_fee
          then 'Customer uploaded payment proof: reservation fee and more'
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
