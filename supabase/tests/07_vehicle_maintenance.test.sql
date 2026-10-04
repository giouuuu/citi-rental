-- Migration 20261006090000_vehicle_maintenance: owner/admin service plans,
-- atomic service record + Repairs and maintenance expense, voiding, the
-- vehicle_maintenance_due view (the one due-status computation) and the
-- vehicle_list service column.
--
-- Dates are relative to T = today in Manila, because the view judges against
-- now(). Odometers are set as postgres between steps.
--
-- V1 AAA 111  P1 Oil change      10,000 km          from T-30 @ 20,000
--             P2 Aircon cleaning  6 months          due T+10
-- V2 BBB 222  P3 PMS             10,000 km / 12 mo  from T-30 @ 20,000, reads 30,500
--             P4 Registration    12 months          from T-400
-- V3 CCC 333  P5 Oil change      10,000 km          from T-10 @ 50,000, older record T-20
--             P6 Tire rotation    2,000 km          from T-10 @ 50,000, reads 51,600
-- V4 DDD 444  P7 Clamp check      6 months          from 2025-08-31
begin;
set local search_path = public, extensions;
select plan(36);

create temporary table t_today as select (now() at time zone 'Asia/Manila')::date as d;
grant select on t_today to authenticated;

update public.vehicles set current_odometer = 25000 where id = 'c0000000-0000-4000-8000-000000000001';
update public.vehicles set current_odometer = 30500 where id = 'c0000000-0000-4000-8000-000000000002';
update public.vehicles set current_odometer = 51600 where id = 'c0000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Customer and staff: nothing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok(
  $$ insert into public.vehicle_maintenance_plans (vehicle_id, name, interval_months, baseline_done_on)
     values ('c0000000-0000-4000-8000-000000000001', 'Sneaky', 6, '2026-01-01') $$,
  '42501', null, 'customer: plan insert denied by RLS');
select throws_ok(
  $$ select public.record_vehicle_maintenance('c0000000-0000-4000-8000-000000000001', null, 'Oil', '2026-03-01', 1, 100) $$,
  '42501', 'Only owners and admins can record maintenance.', 'customer: record denied');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select throws_ok(
  $$ select public.record_vehicle_maintenance('c0000000-0000-4000-8000-000000000001', null, 'Oil', '2026-03-01', 1, 100) $$,
  '42501', null, 'staff: record denied');

-- ---------------------------------------------------------------------------
-- Admin sets up plans
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';

select throws_ok(
  $$ insert into public.vehicle_maintenance_plans (vehicle_id, name, baseline_done_on)
     values ('c0000000-0000-4000-8000-000000000001', 'No interval', '2026-01-01') $$,
  '23514', null, 'plan: needs a km or month interval');
select throws_ok(
  $$ insert into public.vehicle_maintenance_plans (vehicle_id, name, interval_km, baseline_done_on)
     values ('c0000000-0000-4000-8000-000000000001', 'No odometer', 5000, '2026-01-01') $$,
  '23514', null, 'plan: a km interval needs a starting odometer');

insert into public.vehicle_maintenance_plans (
  id, vehicle_id, name, interval_km, interval_months, baseline_done_on, baseline_odometer
)
select v.id, v.vehicle_id, v.name, v.km, v.months, v.done_on, v.odometer
from t_today t,
  lateral (values
    ('3a000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid,
     'Oil change', 10000, null::integer, t.d - 30, 20000::numeric),
    ('3a000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
     'Aircon cleaning', null, 6, ((t.d + 10) - interval '6 months')::date, null),
    ('3a000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
     'PMS', 10000, 12, t.d - 30, 20000),
    ('3a000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002',
     'Registration', null, 12, t.d - 400, null),
    ('3a000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000003',
     'Oil change', 10000, null, t.d - 10, 50000),
    ('3a000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000003',
     'Tire rotation', 2000, null, t.d - 10, 50000),
    ('3a000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000004',
     'Clamp check', null, 6, '2025-08-31'::date, null)
  ) as v(id, vehicle_id, name, km, months, done_on, odometer);

select is(
  (select count(*) from public.vehicle_maintenance_plans where vehicle_id = 'c0000000-0000-4000-8000-000000000001'),
  2::bigint,
  'admin: plans created and readable');
select throws_ok(
  $$ insert into public.vehicle_maintenance_plans (vehicle_id, name, interval_months, baseline_done_on)
     values ('c0000000-0000-4000-8000-000000000001', ' oil change ', 6, '2026-01-01') $$,
  '23505', null, 'plan: one active plan per name per car');

-- ---------------------------------------------------------------------------
-- Due status before any service is recorded
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select from_record, last_odometer, next_due_km, km_left, next_due_on, status
       from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000001' $$,
  $$ values (false, 20000::numeric, 30000::numeric, 5000, null::date, 'on_schedule'::text) $$,
  'due: km counted from the starting point');
select results_eq(
  $$ select status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000002' $$,
  $$ values ('due_soon'::text) $$,
  'due: a months plan within 30 days is due soon');
select results_eq(
  $$ select km_left, status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000003' $$,
  $$ values (-500, 'overdue'::text) $$,
  'due: whichever comes first -- km used up while the year is not');
select results_eq(
  $$ select status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000004' $$,
  $$ values ('overdue'::text) $$,
  'due: whichever comes first -- date passed');
select results_eq(
  $$ select km_left, status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000006' $$,
  $$ values (400, 'due_soon'::text) $$,
  'due: a short interval warns at 20% (400 of 2,000 km)');
select is(
  (select next_due_on from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000007'),
  '2026-02-28'::date,
  'due: Aug 31 + 6 months clamps to Feb 28');

-- ---------------------------------------------------------------------------
-- Recording services
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.vehicle_maintenance_records (vehicle_id, title, performed_on, cost)
     values ('c0000000-0000-4000-8000-000000000001', 'Direct', '2026-03-01', 1) $$,
  '42501', null, 'records: no direct insert, only the RPC');
select throws_ok(
  $$ select public.record_vehicle_maintenance(
       'c0000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001',
       null, (select d from t_today), null, 1500) $$,
  '22023', 'Enter the odometer reading. This service is due by kilometres.',
  'record: km plan needs an odometer');
select throws_ok(
  $$ select public.record_vehicle_maintenance(
       'c0000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000003',
       null, (select d from t_today), null, 1500) $$,
  'P0002', null, 'record: plan from another car rejected');
select throws_ok(
  $$ select public.record_vehicle_maintenance(
       'c0000000-0000-4000-8000-000000000001', null, 'Tires', (select d + 2 from t_today), null, 1500) $$,
  '22023', 'The service date cannot be in the future.', 'record: future date rejected');
select throws_ok(
  $$ select public.record_vehicle_maintenance(
       'c0000000-0000-4000-8000-000000000001', null, null, (select d from t_today), null, 100) $$,
  '22023', null, 'record: a one-off repair needs a title');

select isnt(
  public.record_vehicle_maintenance(
    'c0000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001',
    null, (select d from t_today), 30150, 3360, 'repairs_labor', 'Petron Banilad',
    'vat_invoice', 'SI-0042', 360, 'cash'),
  null,
  'record: oil change recorded with its cost');
select isnt(
  public.record_vehicle_maintenance(
    'c0000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000002',
    null, (select d from t_today), null, 0),
  null,
  'record: free aircon cleaning recorded');
select isnt(
  public.record_vehicle_maintenance(
    'c0000000-0000-4000-8000-000000000003', '3a000000-0000-4000-8000-000000000005',
    null, (select d - 20 from t_today), 45000, 2500),
  null,
  'record: an older oil change logged late');

select results_eq(
  $$ select title, odometer, cost, (expense_id is not null)
       from public.vehicle_maintenance_records
      where vehicle_id = 'c0000000-0000-4000-8000-000000000001'
      order by title desc $$,
  $$ values ('Oil change'::text, 30150.0::numeric, 3360.00::numeric, true),
            ('Aircon cleaning'::text, null::numeric, 0.00::numeric, false) $$,
  'record: title defaults to the plan; zero cost posts no expense');
select is(
  (select current_odometer from public.vehicles where id = 'c0000000-0000-4000-8000-000000000001'),
  30150.0::numeric,
  'record: the service reading moves the odometer forward');
select is(
  (select current_odometer from public.vehicles where id = 'c0000000-0000-4000-8000-000000000003'),
  51600.0::numeric,
  'record: an older, lower reading leaves the odometer alone');
select is(
  (select count(*) from public.expenses),
  0::bigint,
  'admin: still cannot read the expense ledger');

select results_eq(
  $$ select from_record, last_odometer, next_due_km, km_left, status
       from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000001' $$,
  $$ values (true, 30150.0::numeric, 40150.0::numeric, 10000, 'on_schedule'::text) $$,
  'due: restarts from the recorded service');
select results_eq(
  $$ select status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000002' $$,
  $$ values ('on_schedule'::text) $$,
  'due: recording the aircon cleaning clears its warning');
select results_eq(
  $$ select from_record, next_due_km from public.vehicle_maintenance_due
      where id = '3a000000-0000-4000-8000-000000000005' $$,
  $$ values (false, 60000::numeric) $$,
  'due: a record dated before the starting point does not count');

-- ---------------------------------------------------------------------------
-- Vehicles list service column
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select plate_number, service_status, services_due from public.vehicle_list
      where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
                   'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005')
      order by plate_number $$,
  $$ values ('AAA 111'::text, 'on_schedule'::text, 0::bigint),
            ('BBB 222', 'overdue', 2),
            ('CCC 333', 'due_soon', 1),
            ('EEE 555', 'no_schedule', 0) $$,
  'vehicle_list: worst status per car, and how many need attention');

reset role;
update public.vehicles set current_odometer = 39300 where id = 'c0000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$ select km_left, status from public.vehicle_maintenance_due where id = '3a000000-0000-4000-8000-000000000001' $$,
  $$ values (850, 'due_soon'::text) $$,
  'due: within 1,000 km of the next oil change is due soon');

-- ---------------------------------------------------------------------------
-- Owner sees the cost in the books
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select results_eq(
  $$ select c.code, e.vehicle_id, e.gross_amount, e.input_vat, e.net_amount, e.supplier_name,
            e.supplier_vat_registered, e.document_type, e.document_number, e.description, e.status
       from public.vehicle_maintenance_records r
       join public.expenses e on e.id = r.expense_id
       join public.expense_categories c on c.id = e.category_id
      where r.vehicle_id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('repairs_labor'::text, 'c0000000-0000-4000-8000-000000000001'::uuid, 3360.00::numeric,
             360.00::numeric, 3000.00::numeric, 'Petron Banilad'::text, true, 'vat_invoice'::text,
             'SI-0042'::text, 'Oil change · AAA 111 · 30,150 km'::text, 'recorded'::text) $$,
  'owner: the cost is a vehicle-tagged Repairs and maintenance expense');

-- ---------------------------------------------------------------------------
-- Admin voids: record and expense go together
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select lives_ok(
  $$ select public.void_vehicle_maintenance(
       (select id from public.vehicle_maintenance_records
         where plan_id = '3a000000-0000-4000-8000-000000000001')) $$,
  'void: admin can void a service');
select throws_ok(
  $$ select public.void_vehicle_maintenance(
       (select id from public.vehicle_maintenance_records
         where plan_id = '3a000000-0000-4000-8000-000000000001')) $$,
  'P0002', null, 'void: a voided record cannot be voided again');
select results_eq(
  $$ select from_record, next_due_km, status from public.vehicle_maintenance_due
      where id = '3a000000-0000-4000-8000-000000000001' $$,
  $$ values (false, 30000::numeric, 'overdue'::text) $$,
  'void: the plan falls back to its starting point');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select is(
  (select e.status from public.vehicle_maintenance_records r join public.expenses e on e.id = r.expense_id
    where r.plan_id = '3a000000-0000-4000-8000-000000000001'),
  'void',
  'void: the expense is voided with it');

-- Archived plans leave the due view.
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
update public.vehicle_maintenance_plans set is_active = false where id = '3a000000-0000-4000-8000-000000000004';
select is(
  (select services_due from public.vehicle_list where id = 'c0000000-0000-4000-8000-000000000002'),
  1::bigint,
  'archive: a stopped plan no longer counts');

select * from finish(true);
rollback;
