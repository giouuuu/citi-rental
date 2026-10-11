-- ===========================================================================
-- analytics_booking_rows: one row per booking for the Analytics → Bookings tab.
--
-- Returns every rental CREATED in the window plus every rental CANCELLED in
-- the window (a booking made last month and cancelled this month belongs to
-- this month's cancellations). The app aggregates the rows: funnel, status
-- mix, cancellation reasons and timing, channel/service splits, and the
-- downloadable booking list all come from the same rows, so their totals
-- agree.
--
-- Same contract as the other analytics RPCs (20260929103000_analytics_rpcs):
-- SECURITY INVOKER, owner/admin only (42501), Manila-local inclusive window,
-- at most 400 days (22023).
--
-- Derived columns
--   paid               confirmed deposit + balance + adjustment − confirmed refund.
--   refunded           confirmed refunds.
--   first_proof_at     when the renter first sent payment (a deposit/balance
--                      ledger row in any state, or the legacy proof column).
--   first_paid_at      first confirmed deposit/balance/adjustment.
--   paid_before_cancel confirmed credits dated at or before cancelled_at, gross
--                      (refunds come after the cancellation).
--   proof_before_cancel payment was sent (confirmed or not) before cancelling.
--   cancelled_by       'customer' when the renter cancelled online
--                      (cancel_my_booking audits cancelled_by = customer),
--                      otherwise 'staff'. Null unless cancelled.
-- ===========================================================================

create or replace function public.analytics_booking_rows(p_from date, p_to date)
returns table (
  rental_id uuid,
  reference_number text,
  status public.rental_status,
  booking_source text,
  with_driver boolean,
  payment_status public.rental_payment_status,
  created_at timestamptz,
  start_at timestamptz,
  expected_return_at timestamptz,
  actual_return_at timestamptz,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  vehicle_id uuid,
  vehicle_plate text,
  vehicle_name text,
  vehicle_category text,
  pickup_location text,
  destination text,
  quoted_total numeric,
  deposit_amount numeric,
  paid numeric,
  refunded numeric,
  first_proof_at timestamptz,
  first_paid_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_note text,
  reservation_fee_forfeited boolean,
  cancelled_by text,
  paid_before_cancel numeric,
  proof_before_cancel boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid analytics window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Analytics window cannot exceed 400 days.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  select
    r.id,
    r.reference_number,
    r.status,
    r.booking_source,
    coalesce(r.with_driver, false),
    r.payment_status,
    r.created_at,
    r.start_at,
    r.expected_return_at,
    r.actual_return_at,
    r.customer_id,
    c.full_name,
    c.phone_number,
    r.vehicle_id,
    v.plate_number,
    v.name,
    v.category,
    r.pickup_location,
    r.destination,
    r.quoted_total,
    r.deposit_amount,
    coalesce(led.credits, 0) - coalesce(led.refunded, 0),
    coalesce(led.refunded, 0),
    case
      when r.payment_proof_submitted_at is null then led.first_sent_at
      when led.first_sent_at is null then r.payment_proof_submitted_at
      else least(r.payment_proof_submitted_at, led.first_sent_at)
    end,
    led.first_paid_at,
    case when r.status = 'cancelled' then r.cancelled_at end,
    case when r.status = 'cancelled' then r.cancellation_reason end,
    case when r.status = 'cancelled' then r.cancellation_note end,
    case when r.status = 'cancelled' then r.reservation_fee_forfeited end,
    case
      when r.status <> 'cancelled' then null
      when r.cancellation_note = 'Cancelled by the customer online.'
        or exists (
          select 1
          from public.audit_logs a
          where a.resource_type = 'rental'
            and a.resource_id = r.id
            and a.new_data ->> 'status' = 'cancelled'
            and a.new_data ->> 'cancelled_by' = 'customer'
        ) then 'customer'
      else 'staff'
    end,
    case when r.status = 'cancelled' then coalesce(led.credits_before_cancel, 0) else 0 end,
    case
      when r.status <> 'cancelled' then false
      else coalesce(
        r.payment_proof_submitted_at <= r.cancelled_at
          or led.first_sent_at <= r.cancelled_at,
        false
      )
    end
  from public.rentals r
  left join public.customers c on c.id = r.customer_id
  left join public.vehicles v on v.id = r.vehicle_id
  left join lateral (
    select
      sum(p.amount) filter (
        where p.status = 'confirmed'
          and p.payment_type in ('deposit', 'balance', 'adjustment')
      ) as credits,
      sum(p.amount) filter (
        where p.status = 'confirmed' and p.payment_type = 'refund'
      ) as refunded,
      sum(p.amount) filter (
        where p.status = 'confirmed'
          and p.payment_type in ('deposit', 'balance', 'adjustment')
          and p.confirmed_at <= r.cancelled_at
      ) as credits_before_cancel,
      min(coalesce(p.submitted_at, p.confirmed_at, p.created_at)) filter (
        where p.payment_type in ('deposit', 'balance')
      ) as first_sent_at,
      min(p.confirmed_at) filter (
        where p.status = 'confirmed'
          and p.payment_type in ('deposit', 'balance', 'adjustment')
      ) as first_paid_at
    from public.payments p
    where p.rental_id = r.id
  ) led on true
  where (r.created_at >= v_from and r.created_at < v_to)
     or (r.status = 'cancelled' and r.cancelled_at >= v_from and r.cancelled_at < v_to)
  order by r.created_at desc;
end;
$$;

revoke all on function public.analytics_booking_rows(date, date) from public, anon;
grant execute on function public.analytics_booking_rows(date, date) to authenticated;
