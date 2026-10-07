-- ===========================================================================
-- Website analytics: what visitors do on the public site, and where they came
-- from.
--
-- 1. public.site_events — one row per page view, car view, booking start and
--    booking submit. Visitors are an anonymous first-party cookie id; no IP or
--    user agent is stored. `source` is the visitor's last non-direct source
--    (?fb, utm_source, fbclid, referrer), so a Facebook click that books two
--    days later still counts for Facebook.
-- 2. record_site_event — the only write path, service role only. Skips ops
--    accounts so owners previewing the site do not count as visitors.
-- 3. analytics_site_funnel / _vehicles / _timeseries / _live — owner/admin
--    reads for the Analytics page.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Events
-- ---------------------------------------------------------------------------
create table public.site_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null
    check (event_type in ('page_view', 'vehicle_view', 'booking_start', 'booking_submit')),
  visitor_id uuid not null,
  session_id uuid not null,
  source text not null default 'direct'
    check (source ~ '^[a-z0-9._-]{1,40}$'),
  campaign text check (char_length(campaign) <= 80),
  referrer_host text check (char_length(referrer_host) <= 120),
  path text not null check (char_length(path) <= 300),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  rental_id uuid references public.rentals (id) on delete set null
);

comment on table public.site_events is
  'Public-site analytics events. Written only by record_site_event (service role).';
comment on column public.site_events.source is
  'Last non-direct source for the visitor: facebook, instagram, google, tiktok, a utm_source, a referrer host, or direct.';
comment on column public.site_events.campaign is
  'Free-text tag from the link, e.g. ?fb=oct-promo or utm_campaign.';

create index site_events_occurred_at_idx on public.site_events (occurred_at);
create index site_events_vehicle_idx on public.site_events (vehicle_id, occurred_at)
  where vehicle_id is not null;
create index site_events_rental_idx on public.site_events (rental_id)
  where rental_id is not null;

alter table public.site_events enable row level security;

revoke all on public.site_events from public, anon, authenticated;
grant select on public.site_events to authenticated;

create policy site_events_admin_read on public.site_events
for select to authenticated
using ((select private.is_org_admin()));

-- ---------------------------------------------------------------------------
-- 2. The write path
-- ---------------------------------------------------------------------------
create or replace function public.record_site_event(
  p_event_type text,
  p_visitor_id uuid,
  p_session_id uuid,
  p_path text,
  p_source text default 'direct',
  p_campaign text default null,
  p_referrer_host text default null,
  p_device text default null,
  p_vehicle_id uuid default null,
  p_rental_id uuid default null,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ops accounts browsing the public site are not visitors.
  if p_user_id is not null and exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role in ('owner', 'admin', 'staff')
  ) then
    return;
  end if;

  insert into public.site_events (
    event_type, visitor_id, session_id, path, source, campaign,
    referrer_host, device, vehicle_id, rental_id
  )
  values (
    p_event_type,
    p_visitor_id,
    p_session_id,
    left(coalesce(nullif(p_path, ''), '/'), 300),
    coalesce(nullif(p_source, ''), 'direct'),
    left(nullif(btrim(p_campaign), ''), 80),
    left(nullif(btrim(p_referrer_host), ''), 120),
    p_device,
    -- A stale or made-up id must not lose the event to a foreign-key error.
    (select v.id from public.vehicles v where v.id = p_vehicle_id),
    (select r.id from public.rentals r where r.id = p_rental_id)
  );
end;
$$;

revoke all on function public.record_site_event(
  text, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.record_site_event(
  text, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Reads
-- ---------------------------------------------------------------------------

-- A booking counts as paid once the reservation fee is in or staff moved it
-- past draft.
create or replace function private.site_rental_is_paid(p_rental_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.rentals r
    where r.id = p_rental_id
      and (
        r.status in ('reserved', 'active', 'completed', 'overdue')
        or r.payment_status in ('deposit_paid', 'paid_in_full')
      )
  )
$$;

revoke all on function private.site_rental_is_paid(uuid) from public, anon;
grant execute on function private.site_rental_is_paid(uuid) to authenticated;

create or replace function private.assert_site_analytics_window(p_from date, p_to date)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
end;
$$;

revoke all on function private.assert_site_analytics_window(date, date) from public, anon;
grant execute on function private.assert_site_analytics_window(date, date) to authenticated;

-- Funnel per source plus one total row (is_total). Every stage counts
-- distinct visitors and includes the later stages, so it never widens:
-- someone who booked straight from a card still "looked at a car".
create or replace function public.analytics_site_funnel(p_from date, p_to date)
returns table (
  is_total boolean,
  source text,
  visitors integer,
  sessions integer,
  page_views integer,
  car_viewers integer,
  booking_starters integer,
  bookers integer,
  payers integer,
  bookings integer,
  paid_bookings integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_site_analytics_window(p_from, p_to);

  return query
  with ev as (
    select e.*,
      e.event_type = 'booking_submit'
        and e.rental_id is not null
        and private.site_rental_is_paid(e.rental_id) as paid
    from public.site_events e
    where e.occurred_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and e.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
  )
  select
    grouping(ev.source) = 1,
    ev.source,
    count(distinct ev.visitor_id)::integer,
    count(distinct ev.session_id)::integer,
    (count(*) filter (where ev.event_type in ('page_view', 'booking_start')))::integer,
    (count(distinct ev.visitor_id)
      filter (where ev.event_type in ('vehicle_view', 'booking_start', 'booking_submit')))::integer,
    (count(distinct ev.visitor_id)
      filter (where ev.event_type in ('booking_start', 'booking_submit')))::integer,
    (count(distinct ev.visitor_id) filter (where ev.event_type = 'booking_submit'))::integer,
    (count(distinct ev.visitor_id) filter (where ev.paid))::integer,
    (count(distinct ev.rental_id) filter (where ev.event_type = 'booking_submit'))::integer,
    (count(distinct ev.rental_id) filter (where ev.paid))::integer
  from ev
  group by grouping sets ((ev.source), ())
  order by grouping(ev.source) desc, 3 desc, ev.source;
end;
$$;

-- Every car, most looked-at first, with how far its viewers got.
create or replace function public.analytics_site_vehicles(p_from date, p_to date)
returns table (
  vehicle_id uuid,
  plate_number text,
  name text,
  category text,
  views integer,
  viewers integer,
  facebook_viewers integer,
  booking_starters integer,
  bookings integer,
  paid_bookings integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_site_analytics_window(p_from, p_to);

  return query
  with ev as (
    select e.*,
      e.event_type = 'booking_submit'
        and e.rental_id is not null
        and private.site_rental_is_paid(e.rental_id) as paid
    from public.site_events e
    where e.vehicle_id is not null
      and e.occurred_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and e.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
  )
  select
    v.id,
    v.plate_number,
    v.name,
    v.category,
    (count(ev.id) filter (where ev.event_type = 'vehicle_view'))::integer,
    count(distinct ev.visitor_id)::integer,
    (count(distinct ev.visitor_id) filter (where ev.source = 'facebook'))::integer,
    (count(distinct ev.visitor_id)
      filter (where ev.event_type in ('booking_start', 'booking_submit')))::integer,
    (count(distinct ev.rental_id) filter (where ev.event_type = 'booking_submit'))::integer,
    (count(distinct ev.rental_id) filter (where ev.paid))::integer
  from public.vehicles v
  left join ev on ev.vehicle_id = v.id
  group by v.id
  order by 6 desc, 5 desc, v.plate_number;
end;
$$;

-- Visitors and bookings per day/week/month, every bucket present.
create or replace function public.analytics_site_timeseries(
  p_from date,
  p_to date,
  p_bucket text default 'day'
)
returns table (
  bucket_start date,
  visitors integer,
  facebook_visitors integer,
  bookings integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
begin
  perform private.assert_site_analytics_window(p_from, p_to);
  if v_bucket not in ('day', 'week', 'month') then
    raise exception 'Bucket must be day, week, or month.' using errcode = '22023';
  end if;

  return query
  with buckets as (
    select distinct
      case v_bucket when 'day' then gs::date else date_trunc(v_bucket, gs)::date end as bucket
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ),
  ev as (
    select
      case v_bucket
        when 'day' then (e.occurred_at at time zone 'Asia/Manila')::date
        else date_trunc(v_bucket, e.occurred_at at time zone 'Asia/Manila')::date
      end as bucket,
      e.*
    from public.site_events e
    where e.occurred_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and e.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
  )
  select
    b.bucket,
    count(distinct ev.visitor_id)::integer,
    (count(distinct ev.visitor_id) filter (where ev.source = 'facebook'))::integer,
    (count(distinct ev.rental_id) filter (where ev.event_type = 'booking_submit'))::integer
  from buckets b
  left join ev on ev.bucket = b.bucket
  group by b.bucket
  order by b.bucket;
end;
$$;

-- Who is on the site right now (active in the last 5 minutes) and today.
create or replace function public.analytics_site_live()
returns table (
  visitors_now integer,
  facebook_now integer,
  visitors_today integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;

  return query
  select
    (count(distinct e.visitor_id) filter (where e.occurred_at >= now() - interval '5 minutes'))::integer,
    (count(distinct e.visitor_id)
      filter (where e.occurred_at >= now() - interval '5 minutes' and e.source = 'facebook'))::integer,
    count(distinct e.visitor_id)::integer
  from public.site_events e
  where e.occurred_at >= ((now() at time zone 'Asia/Manila')::date::timestamp at time zone 'Asia/Manila');
end;
$$;

revoke all on function public.analytics_site_funnel(date, date) from public, anon;
grant execute on function public.analytics_site_funnel(date, date) to authenticated;
revoke all on function public.analytics_site_vehicles(date, date) from public, anon;
grant execute on function public.analytics_site_vehicles(date, date) to authenticated;
revoke all on function public.analytics_site_timeseries(date, date, text) from public, anon;
grant execute on function public.analytics_site_timeseries(date, date, text) to authenticated;
revoke all on function public.analytics_site_live() from public, anon;
grant execute on function public.analytics_site_live() to authenticated;
