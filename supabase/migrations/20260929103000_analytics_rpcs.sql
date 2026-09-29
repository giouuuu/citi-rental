-- Owner/admin analytics RPCs.
--
-- All four functions are SECURITY INVOKER (RLS still applies) and additionally
-- filter organization_id = private.current_organization_id() explicitly. Only
-- owner/admin may call them (42501 otherwise).
--
-- Windows are Manila LOCAL dates, inclusive: p_from..p_to maps to
--   [p_from 00:00 Asia/Manila, (p_to + 1) 00:00 Asia/Manila)
-- Invalid windows (null, p_to < p_from, more than 400 days) raise 22023.
-- Day bucketing uses (ts at time zone 'Asia/Manila')::date.
--
-- Shared definitions
--   collected         confirmed deposit + balance + adjustment − confirmed refund,
--                     dated by confirmed_at. Penalties are NEVER collected: they
--                     are accrued charges (method 'other'); the customer's later
--                     settlement arrives as a 'balance' row.
--   penalties_billed  confirmed 'penalty' amounts, dated by confirmed_at.
--   occupying rental  status in (reserved, active, overdue, completed).
--   occupied interval [start_at, end) where end = actual_return_at, else
--                     greatest(expected_return_at, now()) while active/overdue,
--                     else expected_return_at.
--   rented days       ceil(clamped overlap / 1 day), 0 without overlap
--                     (same as rentedDaysInWindow in
--                     src/features/reports/lib/aggregate-vehicle-revenue.ts).
--   fleet size (day d) vehicles with status <> 'inactive' and created_at before
--                     the end of d. APPROXIMATION: vehicles.status is current
--                     state only (no history), so a car retired last week is
--                     missing from past days and a car in maintenance today
--                     still counts.
--   late return       completed and actual_return_at > expected_return_at + 1 hour.
--   outstanding       per rental whose car has actually gone out
--                     (status active, overdue or completed; reserved balances
--                     are not owed until pickup, draft/cancelled never count):
--                     greatest(0, quoted_total + confirmed penalties − collected)
--                     over ALL confirmed payments, computed live from the ledger.
--                     This is the exact formula of
--                     private.refresh_rental_payment_summary, but rentals.balance_due
--                     is only refreshed by the payment RPCs (direct ledger writes
--                     and ops-created rentals without a quote leave it stale or
--                     null), so it is not trusted here.

-- ---------------------------------------------------------------------------
-- Small shared helpers (no table access; invoker-safe)
-- ---------------------------------------------------------------------------

create or replace function private.analytics_occupied_end(
  p_status public.rental_status,
  p_expected_return_at timestamptz,
  p_actual_return_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_actual_return_at is not null then p_actual_return_at
    when p_status in ('active', 'overdue')
      then greatest(p_expected_return_at, now())
    else p_expected_return_at
  end
$$;

create or replace function private.analytics_rented_days(
  p_start timestamptz,
  p_end timestamptz,
  p_window_from timestamptz,
  p_window_to timestamptz
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when least(p_end, p_window_to) <= greatest(p_start, p_window_from) then 0
    else ceil(
      extract(epoch from (least(p_end, p_window_to) - greatest(p_start, p_window_from)))
      / 86400.0
    )::integer
  end
$$;

revoke all on function private.analytics_occupied_end(
  public.rental_status, timestamptz, timestamptz
) from public, anon;
grant execute on function private.analytics_occupied_end(
  public.rental_status, timestamptz, timestamptz
) to authenticated, service_role;

revoke all on function private.analytics_rented_days(
  timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon;
grant execute on function private.analytics_rented_days(
  timestamptz, timestamptz, timestamptz, timestamptz
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. analytics_overview
-- ---------------------------------------------------------------------------

create or replace function public.analytics_overview(p_from date, p_to date)
returns table (
  bookings_created integer,
  bookings_public integer,
  bookings_ops integer,
  drafts_open integer,
  cancellations integer,
  completed_rentals integer,
  late_returns integer,
  overdue_now integer,
  collected numeric,
  refunds numeric,
  penalties_billed numeric,
  outstanding_balance numeric,
  rented_vehicle_days integer,
  fleet_vehicle_days integer,
  avg_rental_days numeric,
  avg_lead_time_days numeric,
  customers_total integer,
  customers_blocked integer,
  customers_active integer,
  customers_new integer,
  customers_returning integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_bookings_created integer;
  v_bookings_public integer;
  v_bookings_ops integer;
  v_drafts_open integer;
  v_cancellations integer;
  v_completed integer;
  v_late integer;
  v_overdue_now integer;
  v_collected numeric;
  v_refunds numeric;
  v_penalties numeric;
  v_outstanding numeric;
  v_rented_days integer;
  v_fleet_days integer;
  v_avg_rental_days numeric;
  v_avg_lead_days numeric;
  v_customers_total integer;
  v_customers_blocked integer;
  v_customers_active integer;
  v_customers_new integer;
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

  v_org := private.current_organization_id();
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  select
    count(*)::integer,
    (count(*) filter (where r.booking_source = 'public_web'))::integer,
    (count(*) filter (where r.booking_source = 'ops'))::integer,
    (count(*) filter (where r.status = 'draft'))::integer
  into v_bookings_created, v_bookings_public, v_bookings_ops, v_drafts_open
  from public.rentals r
  where r.organization_id = v_org
    and r.created_at >= v_from
    and r.created_at < v_to;

  select count(*)::integer
  into v_cancellations
  from public.rentals r
  where r.organization_id = v_org
    and r.status = 'cancelled'
    and r.cancelled_at >= v_from
    and r.cancelled_at < v_to;

  select
    count(*)::integer,
    (count(*) filter (
      where r.actual_return_at > r.expected_return_at + interval '1 hour'
    ))::integer
  into v_completed, v_late
  from public.rentals r
  where r.organization_id = v_org
    and r.status = 'completed'
    and r.actual_return_at >= v_from
    and r.actual_return_at < v_to;

  select count(*)::integer
  into v_overdue_now
  from public.rentals r
  where r.organization_id = v_org
    and (
      r.status = 'overdue'
      or (r.status = 'active' and r.expected_return_at < now())
    );

  select
    coalesce(sum(case
      when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
      when p.payment_type = 'refund' then -p.amount
      else 0
    end), 0),
    coalesce(sum(p.amount) filter (where p.payment_type = 'refund'), 0),
    coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0)
  into v_collected, v_refunds, v_penalties
  from public.payments p
  where p.organization_id = v_org
    and p.status = 'confirmed'
    and p.confirmed_at >= v_from
    and p.confirmed_at < v_to;

  select coalesce(sum(greatest(
    0,
    coalesce(r.quoted_total, 0) + coalesce(led.penalties, 0) - coalesce(led.credits, 0)
  )), 0)
  into v_outstanding
  from public.rentals r
  left join lateral (
    select
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as credits,
      sum(p.amount) filter (where p.payment_type = 'penalty') as penalties
    from public.payments p
    where p.organization_id = v_org
      and p.rental_id = r.id
      and p.status = 'confirmed'
  ) led on true
  where r.organization_id = v_org
    and r.status in ('active', 'overdue', 'completed');

  select
    coalesce(sum(private.analytics_rented_days(
      r.start_at,
      private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
      v_from,
      v_to
    )), 0)::integer
  into v_rented_days
  from public.rentals r
  where r.organization_id = v_org
    and r.status in ('reserved', 'active', 'overdue', 'completed')
    and r.start_at < v_to;

  -- Fleet capacity counts only days up to today; future days are not capacity
  -- that was available to sell yet.
  select coalesce(sum((
    select count(*)
    from public.vehicles v
    where v.organization_id = v_org
      and v.status <> 'inactive'
      and v.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Manila')
  )), 0)::integer
  into v_fleet_days
  from (
    select gs::date as day
    from generate_series(
      p_from::timestamp,
      least(p_to, v_today)::timestamp,
      interval '1 day'
    ) gs
  ) d;

  select round(avg(
    extract(epoch from (
      private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at)
      - r.start_at
    )) / 86400.0
  ), 1)
  into v_avg_rental_days
  from public.rentals r
  where r.organization_id = v_org
    and r.status in ('reserved', 'active', 'overdue', 'completed')
    and r.start_at >= v_from
    and r.start_at < v_to;

  select round(avg(extract(epoch from (r.start_at - r.created_at)) / 86400.0), 1)
  into v_avg_lead_days
  from public.rentals r
  where r.organization_id = v_org
    and r.status not in ('draft', 'cancelled')
    and r.created_at >= v_from
    and r.created_at < v_to;

  select
    count(*)::integer,
    (count(*) filter (where c.is_blocked))::integer
  into v_customers_total, v_customers_blocked
  from public.customers c
  where c.organization_id = v_org;

  with active as (
    select distinct r.customer_id
    from public.rentals r
    where r.organization_id = v_org
      and r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at >= v_from
      and r.start_at < v_to
  ),
  first_rental as (
    select r.customer_id, min(r.start_at) as first_start_at
    from public.rentals r
    join active a on a.customer_id = r.customer_id
    where r.organization_id = v_org
      and r.status in ('reserved', 'active', 'overdue', 'completed')
    group by r.customer_id
  )
  select
    (select count(*) from active)::integer,
    (select count(*) from first_rental f where f.first_start_at >= v_from)::integer
  into v_customers_active, v_customers_new;

  return query
  select
    v_bookings_created,
    v_bookings_public,
    v_bookings_ops,
    v_drafts_open,
    v_cancellations,
    v_completed,
    v_late,
    v_overdue_now,
    round(v_collected, 2),
    round(v_refunds, 2),
    round(v_penalties, 2),
    round(v_outstanding, 2),
    v_rented_days,
    v_fleet_days,
    v_avg_rental_days,
    v_avg_lead_days,
    v_customers_total,
    v_customers_blocked,
    v_customers_active,
    v_customers_new,
    v_customers_active - v_customers_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. analytics_timeseries
-- ---------------------------------------------------------------------------

create or replace function public.analytics_timeseries(
  p_from date,
  p_to date,
  p_bucket text default 'day'
)
returns table (
  bucket_start date,
  collected numeric,
  penalties_billed numeric,
  bookings_created integer,
  bookings_public integer,
  cancellations integer,
  rented_vehicle_days integer,
  fleet_vehicle_days integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
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
  if v_bucket not in ('day', 'week', 'month') then
    raise exception 'Bucket must be day, week, or month.' using errcode = '22023';
  end if;

  v_org := private.current_organization_id();
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with days as (
    select
      gs::date as day,
      (gs at time zone 'Asia/Manila') as day_start,
      ((gs + interval '1 day') at time zone 'Asia/Manila') as day_end,
      case v_bucket
        when 'day' then gs::date
        else date_trunc(v_bucket, gs)::date
      end as bucket
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ),
  occ as (
    select
      r.vehicle_id,
      r.start_at,
      private.analytics_occupied_end(
        r.status, r.expected_return_at, r.actual_return_at
      ) as occ_end
    from public.rentals r
    where r.organization_id = v_org
      and r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at < v_to
  ),
  pay as (
    select
      (p.confirmed_at at time zone 'Asia/Manila')::date as day,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as collected,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0) as penalties
    from public.payments p
    where p.organization_id = v_org
      and p.status = 'confirmed'
      and p.confirmed_at >= v_from
      and p.confirmed_at < v_to
    group by 1
  ),
  bk as (
    select
      (r.created_at at time zone 'Asia/Manila')::date as day,
      count(*) as created,
      count(*) filter (where r.booking_source = 'public_web') as public_created
    from public.rentals r
    where r.organization_id = v_org
      and r.created_at >= v_from
      and r.created_at < v_to
    group by 1
  ),
  cx as (
    select
      (r.cancelled_at at time zone 'Asia/Manila')::date as day,
      count(*) as cancelled
    from public.rentals r
    where r.organization_id = v_org
      and r.status = 'cancelled'
      and r.cancelled_at >= v_from
      and r.cancelled_at < v_to
    group by 1
  ),
  per_day as (
    select
      d.bucket,
      coalesce(pay.collected, 0) as collected,
      coalesce(pay.penalties, 0) as penalties,
      coalesce(bk.created, 0) as created,
      coalesce(bk.public_created, 0) as public_created,
      coalesce(cx.cancelled, 0) as cancelled,
      (
        select count(distinct o.vehicle_id)
        from occ o
        where o.start_at < d.day_end
          and o.occ_end > d.day_start
      ) as rented,
      (
        select count(*)
        from public.vehicles v
        where v.organization_id = v_org
          and v.status <> 'inactive'
          and v.created_at < d.day_end
      ) as fleet
    from days d
    left join pay on pay.day = d.day
    left join bk on bk.day = d.day
    left join cx on cx.day = d.day
  )
  select
    pd.bucket,
    round(sum(pd.collected), 2),
    round(sum(pd.penalties), 2),
    sum(pd.created)::integer,
    sum(pd.public_created)::integer,
    sum(pd.cancelled)::integer,
    sum(pd.rented)::integer,
    sum(pd.fleet)::integer
  from per_day pd
  group by pd.bucket
  order by pd.bucket;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. analytics_vehicle_performance
-- ---------------------------------------------------------------------------

create or replace function public.analytics_vehicle_performance(
  p_from date,
  p_to date
)
returns table (
  vehicle_id uuid,
  plate_number text,
  name text,
  category text,
  status text,
  daily_rate numeric,
  rental_count integer,
  rented_days integer,
  window_days integer,
  collected numeric,
  penalties_billed numeric,
  last_return_at timestamptz,
  next_start_at timestamptz,
  on_rent_now boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
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

  v_org := private.current_organization_id();
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with occ as (
    select
      r.vehicle_id,
      private.analytics_rented_days(
        r.start_at,
        private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
        v_from,
        v_to
      ) as days_in_window
    from public.rentals r
    where r.organization_id = v_org
      and r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at < v_to
      and private.analytics_occupied_end(
        r.status, r.expected_return_at, r.actual_return_at
      ) > v_from
  ),
  occ_agg as (
    select
      o.vehicle_id,
      count(*) as rental_count,
      sum(o.days_in_window) as rented_days
    from occ o
    group by o.vehicle_id
  ),
  pay_agg as (
    select
      r.vehicle_id,
      count(*) as payment_count,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as collected,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0) as penalties
    from public.payments p
    join public.rentals r
      on r.id = p.rental_id
     and r.organization_id = p.organization_id
    where p.organization_id = v_org
      and p.status = 'confirmed'
      and p.confirmed_at >= v_from
      and p.confirmed_at < v_to
    group by r.vehicle_id
  ),
  life as (
    select
      r.vehicle_id,
      max(r.actual_return_at) filter (
        where r.status = 'completed' and r.actual_return_at <= now()
      ) as last_return_at,
      min(r.start_at) filter (
        where r.status = 'reserved' and r.start_at > now()
      ) as next_start_at,
      bool_or(r.status in ('active', 'overdue')) as on_rent_now
    from public.rentals r
    where r.organization_id = v_org
    group by r.vehicle_id
  )
  select
    v.id,
    v.plate_number,
    v.name,
    v.category,
    v.status::text,
    v.daily_rate,
    coalesce(oa.rental_count, 0)::integer,
    coalesce(oa.rented_days, 0)::integer,
    (p_to - p_from + 1)::integer,
    round(coalesce(pa.collected, 0), 2),
    round(coalesce(pa.penalties, 0), 2),
    l.last_return_at,
    l.next_start_at,
    coalesce(l.on_rent_now, false)
  from public.vehicles v
  left join occ_agg oa on oa.vehicle_id = v.id
  left join pay_agg pa on pa.vehicle_id = v.id
  left join life l on l.vehicle_id = v.id
  where v.organization_id = v_org
    and (
      v.status <> 'inactive'
      or coalesce(oa.rental_count, 0) > 0
      or coalesce(pa.payment_count, 0) > 0
    )
  order by coalesce(pa.collected, 0) desc, v.plate_number asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. analytics_top_customers
-- ---------------------------------------------------------------------------

create or replace function public.analytics_top_customers(
  p_from date,
  p_to date,
  p_limit integer default 10
)
returns table (
  customer_id uuid,
  full_name text,
  phone_number text,
  is_blocked boolean,
  rentals_in_window integer,
  rentals_lifetime integer,
  collected_in_window numeric,
  collected_lifetime numeric,
  outstanding numeric,
  late_returns_lifetime integer,
  first_rental_at timestamptz,
  last_rental_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
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

  v_org := private.current_organization_id();
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with ledger as (
    select
      p.rental_id,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as credits_lifetime,
      coalesce(sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) filter (where p.confirmed_at >= v_from and p.confirmed_at < v_to), 0)
        as credits_in_window,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0)
        as penalties_lifetime
    from public.payments p
    where p.organization_id = v_org
      and p.status = 'confirmed'
    group by p.rental_id
  ),
  per_customer as (
    select
      r.customer_id,
      count(*) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
          and r.start_at >= v_from
          and r.start_at < v_to
      ) as rentals_in_window,
      count(*) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as rentals_lifetime,
      coalesce(sum(l.credits_in_window), 0) as collected_in_window,
      coalesce(sum(l.credits_lifetime), 0) as collected_lifetime,
      coalesce(sum(greatest(
        0,
        coalesce(r.quoted_total, 0)
          + coalesce(l.penalties_lifetime, 0)
          - coalesce(l.credits_lifetime, 0)
      )) filter (where r.status in ('active', 'overdue', 'completed')), 0) as outstanding,
      count(*) filter (
        where r.status = 'completed'
          and r.actual_return_at > r.expected_return_at + interval '1 hour'
      ) as late_returns_lifetime,
      min(r.start_at) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as first_rental_at,
      max(r.start_at) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as last_rental_at
    from public.rentals r
    left join ledger l on l.rental_id = r.id
    where r.organization_id = v_org
    group by r.customer_id
  )
  select
    c.id,
    c.full_name,
    c.phone_number,
    c.is_blocked,
    pc.rentals_in_window::integer,
    pc.rentals_lifetime::integer,
    round(pc.collected_in_window, 2),
    round(pc.collected_lifetime, 2),
    round(pc.outstanding, 2),
    pc.late_returns_lifetime::integer,
    pc.first_rental_at,
    pc.last_rental_at
  from per_customer pc
  join public.customers c
    on c.id = pc.customer_id
   and c.organization_id = v_org
  where pc.rentals_in_window > 0
     or pc.collected_in_window > 0
  order by
    pc.collected_in_window desc,
    pc.rentals_in_window desc,
    c.full_name asc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.analytics_overview(date, date) from public, anon;
grant execute on function public.analytics_overview(date, date) to authenticated;

revoke all on function public.analytics_timeseries(date, date, text) from public, anon;
grant execute on function public.analytics_timeseries(date, date, text) to authenticated;

revoke all on function public.analytics_vehicle_performance(date, date) from public, anon;
grant execute on function public.analytics_vehicle_performance(date, date) to authenticated;

revoke all on function public.analytics_top_customers(date, date, integer) from public, anon;
grant execute on function public.analytics_top_customers(date, date, integer) to authenticated;

comment on function public.analytics_overview(date, date) is
  'Owner/admin KPI summary for a Manila-local inclusive date window (one row).';
comment on function public.analytics_timeseries(date, date, text) is
  'Owner/admin zero-filled day/week/month series for a Manila-local inclusive window; works for future windows (forward occupancy).';
comment on function public.analytics_vehicle_performance(date, date) is
  'Owner/admin per-vehicle utilization and revenue for a Manila-local inclusive window.';
comment on function public.analytics_top_customers(date, date, integer) is
  'Owner/admin top customers by collected revenue in a Manila-local inclusive window.';
