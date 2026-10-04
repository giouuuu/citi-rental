-- Migration 20260929103000_analytics_rpcs: role gate, window validation and
-- hand-computed numbers over supabase/tests/_seed.sql.
--
-- Window W = 2026-03-01..2026-03-10 (Manila), i.e.
-- [2026-03-01 00:00+08, 2026-03-11 00:00+08).
--
-- Hand computation (see _seed.sql for the rows):
--   bookings created in W: R2 (web, 03-01), R4 (03-04), R3 (03-07), R7 (draft, 03-09)
--     -> created 4, public 1, ops 3, drafts_open 1
--   cancellations: R4 (cancelled_at 03-06) -> 1
--   completed with actual_return in W: R1 (03-02 12:00, 2h late), R2 (early), R6 (on time)
--     -> completed 3, late 1
--   overdue_now: R3 active, expected 03-09 < now -> 1
--   collected in W: +5600 +500 (R1 balances) +1800 +4200 -300 (R2) +1200 (R3)
--                   +2000 +10 (R6) +900 -900 (R4) = 15010
--     (boundary probes: 50 at 03-11 00:00 and 25 at 02-28 23:59:59 are outside;
--      the R1 500 penalty and R3 penalty are never "collected")
--   refunds 300 + 900 = 1200; penalties_billed 500 (R1; R3's 200 is 03-12)
--   outstanding (all-time ledger, status active/overdue/completed only):
--     R0 6000-6000=0, R1 8000+500-8500=0, R2 6000-5775=225, R3 4000+200-1200=3000,
--     R6 4000-2010=1990  -> 5215   (R5 reserved: not owed until pickup; R4/R7 never)
--   rented days (per rental, ceil): R1 1.5d->2, R2 47h->2, R3 03-08 10:00..W end->3,
--     R6 48h->2 -> 9
--   fleet days: V1,V2,V5 x10 + V3 (created 03-06) x5 = 35 (V4 inactive)
--   avg lead (non-draft, non-cancelled created in W): R2 49h, R3 24h -> 1.5
--   customers: total 4, blocked 1 (Carol); active in W: Alice(R2), Dan(R3), Carol(R6) = 3;
--     new = Dan only (Alice's first is R1 in Feb, Carol's first is R0 in Jan) -> 1, returning 2
begin;
set local search_path = public, extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Role gate
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok($$ select * from public.analytics_overview('2026-03-01', '2026-03-10') $$,
  '42501', 'Analytics are available to owners and admins only.', 'customer: overview denied');
select throws_ok($$ select * from public.analytics_timeseries('2026-03-01', '2026-03-10') $$,
  '42501', null, 'customer: timeseries denied');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select throws_ok($$ select * from public.analytics_overview('2026-03-01', '2026-03-10') $$,
  '42501', null, 'staff: overview denied');
select throws_ok($$ select * from public.analytics_timeseries('2026-03-01', '2026-03-10', 'week') $$,
  '42501', null, 'staff: timeseries denied');
select throws_ok($$ select * from public.analytics_vehicle_performance('2026-03-01', '2026-03-10') $$,
  '42501', null, 'staff: vehicle performance denied');
select throws_ok($$ select * from public.analytics_top_customers('2026-03-01', '2026-03-10') $$,
  '42501', null, 'staff: top customers denied');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.analytics_overview('2026-03-01', '2026-03-10') $$,
  '42501', null, 'anon: no execute privilege');
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select lives_ok($$ select * from public.analytics_overview('2026-03-01', '2026-03-10') $$,
  'admin: allowed');

-- ---------------------------------------------------------------------------
-- Owner of org A
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';

select throws_ok($$ select * from public.analytics_overview('2026-03-10', '2026-03-01') $$,
  '22023', null, 'p_to < p_from rejected');
select throws_ok($$ select * from public.analytics_overview('2026-01-01', '2027-02-05') $$,
  '22023', null, 'window over 400 days rejected');
select throws_ok($$ select * from public.analytics_timeseries('2026-03-01', '2026-03-10', 'year') $$,
  '22023', null, 'unknown bucket rejected');
select lives_ok($$ select * from public.analytics_overview('2026-01-01', '2027-02-04') $$,
  'exactly 400 days accepted');

-- overview
select is(
  (select row(bookings_created, bookings_public, bookings_ops, drafts_open,
              cancellations, completed_rentals, late_returns, overdue_now)::text
     from public.analytics_overview('2026-03-01', '2026-03-10')),
  '(4,1,3,1,1,3,1,1)',
  'overview: booking / lifecycle counts'
);
select is(
  (select row(collected, refunds, penalties_billed, outstanding_balance)::text
     from public.analytics_overview('2026-03-01', '2026-03-10')),
  '(15010.00,1200.00,500.00,5215.00)',
  'overview: collected excludes penalties and nets refunds; outstanding excludes reserved/draft/cancelled'
);
select is(
  (select row(rented_vehicle_days, fleet_vehicle_days, avg_lead_time_days)::text
     from public.analytics_overview('2026-03-01', '2026-03-10')),
  '(9,35,1.5)',
  'overview: rented days, fleet days, lead time'
);
select is(
  (select avg_rental_days from public.analytics_overview('2026-03-01', '2026-03-10')),
  round((
    47.0 / 24.0
    + extract(epoch from (now() - '2026-03-08 10:00+08'::timestamptz)) / 86400.0
    + 2.0
  ) / 3.0, 1),
  'overview: avg rental days (R2, still-out R3 until now, R6)'
);
select is(
  (select row(customers_total, customers_blocked, customers_active, customers_new, customers_returning)::text
     from public.analytics_overview('2026-03-01', '2026-03-10')),
  '(4,1,3,1,2)',
  'overview: customer counts'
);
select is(
  (select row(bookings_created, collected, rented_vehicle_days, fleet_vehicle_days)::text
     from public.analytics_overview('2026-04-05', '2026-04-06')),
  '(0,0.00,2,8)',
  'overview: quiet window still returns one row (still-out R3 occupies 2 days; fleet 4 x 2)'
);

-- timeseries: daily
select is(
  (select count(*) from public.analytics_timeseries('2026-03-01', '2026-03-10', 'day')),
  10::bigint,
  'daily: one row per day (zero-filled)'
);
select results_eq(
  $$ select bucket_start, collected, penalties_billed, bookings_created, bookings_public,
            cancellations, rented_vehicle_days, fleet_vehicle_days
       from public.analytics_timeseries('2026-03-01', '2026-03-10', 'day')
      where bucket_start in ('2026-03-01', '2026-03-02', '2026-03-06', '2026-03-07', '2026-03-10') $$,
  $$ values
       ('2026-03-01'::date, 1800.00::numeric, 0.00::numeric, 1, 1, 0, 1, 3),
       ('2026-03-02'::date, 7600.00::numeric, 500.00::numeric, 0, 0, 0, 2, 3),
       ('2026-03-06'::date, -1200.00::numeric, 0.00::numeric, 0, 0, 1, 0, 4),
       ('2026-03-07'::date, 1200.00::numeric, 0.00::numeric, 1, 0, 0, 0, 4),
       ('2026-03-10'::date, 10.00::numeric, 0.00::numeric, 0, 0, 0, 1, 4) $$,
  'daily: spot-checked buckets (incl. a zero-activity day and Manila-midnight boundaries)'
);
select is(
  (select row(sum(collected), sum(penalties_billed), sum(bookings_created),
              sum(rented_vehicle_days), sum(fleet_vehicle_days))::text
     from public.analytics_timeseries('2026-03-01', '2026-03-10', 'day')),
  '(15010.00,500.00,4,11,35)',
  'daily: totals reconcile with the overview (rented = distinct vehicles per day)'
);

-- timeseries: weekly (2026-03-01 is a Sunday -> first bucket Monday 02-23)
select results_eq(
  $$ select bucket_start, collected, penalties_billed, bookings_created, bookings_public,
            cancellations, rented_vehicle_days, fleet_vehicle_days
       from public.analytics_timeseries('2026-03-01', '2026-03-10', 'week') $$,
  $$ values
       ('2026-02-23'::date, 1800.00::numeric, 0.00::numeric, 1, 1, 0, 1, 3),
       ('2026-03-02'::date, 13200.00::numeric, 500.00::numeric, 2, 0, 1, 8, 24),
       ('2026-03-09'::date, 10.00::numeric, 0.00::numeric, 1, 0, 0, 2, 8) $$,
  'weekly: Monday buckets, only in-window activity counted'
);

-- timeseries: monthly
select results_eq(
  $$ select bucket_start, collected, penalties_billed, bookings_created, bookings_public,
            cancellations, rented_vehicle_days, fleet_vehicle_days
       from public.analytics_timeseries('2026-03-01', '2026-03-10', 'month') $$,
  $$ values ('2026-03-01'::date, 15010.00::numeric, 500.00::numeric, 4, 1, 1, 11, 35) $$,
  'monthly: single bucket'
);
select is(
  (select bucket_start from public.analytics_timeseries('2026-02-15', '2026-03-10', 'month') limit 1),
  '2026-02-01'::date,
  'monthly: first bucket starts on the 1st even before p_from'
);
select is(
  (select sum(collected) from public.analytics_timeseries('2026-02-15', '2026-03-10', 'month')),
  17435.00::numeric,
  'monthly: 02-15..03-10 adds the Feb 21 deposit (2400) and the 02-28 23:59:59 probe (25)'
);

-- timeseries: forward occupancy window (today .. today + 30)
select is(
  (select count(*) from public.analytics_timeseries(
     (now() at time zone 'Asia/Manila')::date,
     (now() at time zone 'Asia/Manila')::date + 30, 'day')),
  31::bigint,
  'forward: 31 daily buckets'
);
select is(
  (select row(sum(rented_vehicle_days), sum(fleet_vehicle_days))::text
     from public.analytics_timeseries(
       (now() at time zone 'Asia/Manila')::date,
       (now() at time zone 'Asia/Manila')::date + 30, 'day')),
  '(4,124)',
  'forward: reserved R5 (3 days) + still-out R3 (today) occupy; fleet 4 x 31'
);
select is(
  (select rented_vehicle_days from public.analytics_timeseries(
     (now() at time zone 'Asia/Manila')::date,
     (now() at time zone 'Asia/Manila')::date + 30, 'day')
    where bucket_start = (now() at time zone 'Asia/Manila')::date + 3),
  1,
  'forward: reserved rental counts as occupying on its future day'
);
select is(
  (select row(fleet_vehicle_days, rented_vehicle_days)::text from public.analytics_overview(
     (now() at time zone 'Asia/Manila')::date,
     (now() at time zone 'Asia/Manila')::date + 30)),
  '(4,3)',
  'forward overview: fleet days stop at today; rented days include future reservations'
);

-- vehicle performance
select results_eq(
  $$ select plate_number, status, rental_count, rented_days, window_days,
            collected, penalties_billed, on_rent_now
       from public.analytics_vehicle_performance('2026-03-01', '2026-03-10') $$,
  $$ values
       ('AAA 111'::text, 'available'::text, 2, 5, 10, 7300.00::numeric, 500.00::numeric, true),
       ('BBB 222'::text, 'available'::text, 1, 2, 10, 5700.00::numeric, 0.00::numeric, false),
       ('DDD 444'::text, 'inactive'::text, 1, 2, 10, 2010.00::numeric, 0.00::numeric, false),
       ('CCC 333'::text, 'available'::text, 0, 0, 10, 0.00::numeric, 0.00::numeric, false),
       ('EEE 555'::text, 'maintenance'::text, 0, 0, 10, 0.00::numeric, 0.00::numeric, false) $$,
  'vehicle performance: idle + maintenance included, inactive only with activity, ordered by collected'
);
select is(
  (select row(last_return_at = '2026-03-02 12:00+08'::timestamptz, next_start_at is null, on_rent_now)::text
     from public.analytics_vehicle_performance('2026-03-01', '2026-03-10')
    where plate_number = 'AAA 111'),
  '(t,t,t)',
  'vehicle out on rent whose last completed return was long ago reports on_rent_now = true'
);
select is(
  (select next_start_at from public.analytics_vehicle_performance('2026-03-01', '2026-03-10')
    where plate_number = 'BBB 222'),
  ((now() at time zone 'Asia/Manila')::date + 2 + time '10:00') at time zone 'Asia/Manila',
  'vehicle performance: next_start_at is the upcoming reservation'
);
select is(
  (select count(*) from public.analytics_vehicle_performance('2026-05-01', '2026-05-02')
    where plate_number = 'DDD 444'),
  0::bigint,
  'inactive vehicle without activity in window is excluded'
);

-- top customers
select results_eq(
  $$ select full_name, is_blocked, rentals_in_window, rentals_lifetime,
            collected_in_window, collected_lifetime, outstanding,
            late_returns_lifetime, first_rental_at, last_rental_at
       from public.analytics_top_customers('2026-03-01', '2026-03-10') $$,
  $$ values
       ('Alice Renter'::text, false, 1, 2, 11800.00::numeric, 14275.00::numeric, 225.00::numeric, 1,
        '2026-02-27 10:00+08'::timestamptz, '2026-03-03 10:00+08'::timestamptz),
       ('Carol Blocked'::text, true, 1, 2, 2010.00::numeric, 8010.00::numeric, 1990.00::numeric, 0,
        '2026-01-10 10:00+08'::timestamptz, '2026-03-02 10:00+08'::timestamptz),
       ('Dan Driver'::text, false, 1, 2, 1200.00::numeric, 1200.00::numeric, 3000.00::numeric, 0,
        '2026-03-08 10:00+08'::timestamptz,
        ((now() at time zone 'Asia/Manila')::date + 2 + time '10:00') at time zone 'Asia/Manila') $$,
  'top customers: ordering, money, outstanding (Dan''s reserved R5 not owed yet), late returns; Bob excluded'
);
select results_eq(
  $$ select full_name from public.analytics_top_customers('2026-03-01', '2026-03-10', 2) $$,
  $$ values ('Alice Renter'::text), ('Carol Blocked'::text) $$,
  'top customers: p_limit respected'
);
select is(
  (select count(*) from public.analytics_top_customers('2026-03-01', '2026-03-10', 0)),
  1::bigint,
  'top customers: p_limit clamped to at least 1'
);

-- ---------------------------------------------------------------------------
-- Owner of org B sees only org B
-- ---------------------------------------------------------------------------
reset role;
select ok(
  (select bool_and(not p.prosecdef)
     from pg_proc p
    where p.oid in (
      'public.analytics_overview(date, date)'::regprocedure,
      'public.analytics_timeseries(date, date, text)'::regprocedure,
      'public.analytics_vehicle_performance(date, date)'::regprocedure,
      'public.analytics_top_customers(date, date, integer)'::regprocedure
    )),
  'analytics functions are SECURITY INVOKER'
);

select * from finish(true);
rollback;
