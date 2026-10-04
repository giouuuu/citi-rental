-- Migration 20260929100000_restrict_org_reads_to_staff: customers (Google
-- sign-ins with role `customer` inside the business org) must not read org data
-- directly; staff/admin/owner still can.
begin;
set local search_path = public, extensions;
select plan(45);

-- ---------------------------------------------------------------------------
-- Customer Alice
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';

select is((select count(*) from public.customers), 0::bigint, 'customer: 0 customers');
select is((select count(*) from public.rentals), 0::bigint, 'customer: 0 rentals');
select is((select count(*) from public.vehicles), 0::bigint, 'customer: 0 vehicles');
select is((select count(*) from public.drivers), 0::bigint, 'customer: 0 drivers');
select is((select count(*) from public.payments), 0::bigint, 'customer: 0 payments');
select is((select count(*) from public.gps_devices), 0::bigint, 'customer: 0 gps devices');
select is((select count(*) from public.app_settings), 0::bigint, 'customer: 0 app settings (not even non-sensitive)');
select is((select count(*) from public.inspection_checklist_templates), 0::bigint, 'customer: 0 checklist templates');
select is((select count(*) from public.inspection_checklist_template_items), 0::bigint, 'customer: 0 checklist items');
select is((select count(*) from public.audit_logs), 0::bigint, 'customer: 0 audit logs');
select is((select count(*) from public.profiles), 1::bigint, 'customer: only one profile visible');
select is(
  (select id from public.profiles),
  '0000000a-0000-4000-8000-000000000004'::uuid,
  'customer: the visible profile is their own'
);
select is((select count(*) from public.company_profile), 1::bigint, 'customer: still reads the company profile');
select is((select count(*) from public.vehicle_photos), 0::bigint, 'customer: vehicle_photos public policy still evaluates (empty table)');

select is(
  (select count(*) from public.list_my_bookings()),
  2::bigint,
  'customer: list_my_bookings still works (SECURITY DEFINER)'
);
select set_eq(
  $$ select reference_number from public.list_my_bookings() $$,
  array['OPS-001', 'WEB-260301-AAAAAA'],
  'customer: list_my_bookings returns only their own bookings'
);
select is(
  (public.get_my_booking_condition_report('e0000000-0000-4000-8000-000000000001') -> 'rental' ->> 'reference_number'),
  'OPS-001',
  'customer: condition report RPC still works for own booking'
);
select throws_ok(
  $$ select public.get_my_booking_condition_report('e0000000-0000-4000-8000-000000000003') $$,
  'P0002',
  null,
  'customer: condition report RPC refuses someone else''s booking'
);
select is(
  (select count(*) from public.list_public_available_vehicles(null, null)),
  3::bigint,
  'customer: public fleet RPC still lists available vehicles'
);
select is(
  (select name from public.get_public_vehicle('c0000000-0000-4000-8000-000000000001')),
  'Vios One',
  'customer: get_public_vehicle still works'
);

-- storage: customer branch now goes through a SECURITY DEFINER helper
select is(
  (select count(*) from storage.objects where bucket_id = 'rental-inspection-photos'),
  1::bigint,
  'customer: sees inspection photos of their own rental only'
);
select ok(
  (select name from storage.objects where bucket_id = 'rental-inspection-photos')
    like '%/e0000000-0000-4000-8000-000000000001/%',
  'customer: the visible photo belongs to their rental'
);

-- ---------------------------------------------------------------------------
-- Customer Mallory (no bookings)
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000005","role":"authenticated","email":"mallory@evil.test"}';
select is((select count(*) from public.customers), 0::bigint, 'other customer: 0 customers');
select is((select count(*) from public.profiles), 1::bigint, 'other customer: only own profile');
select is((select count(*) from public.list_my_bookings()), 0::bigint, 'other customer: no bookings');
select is(
  (select count(*) from storage.objects where bucket_id = 'rental-inspection-photos'),
  0::bigint,
  'other customer: no inspection photos'
);

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select is((select count(*) from public.customers), 4::bigint, 'staff: all 4 org customers');
select is((select count(*) from public.rentals), 8::bigint, 'staff: all 8 org rentals');
select is((select count(*) from public.vehicles), 5::bigint, 'staff: all 5 org vehicles');
select is((select count(*) from public.drivers), 1::bigint, 'staff: org drivers');
select is((select count(*) from public.payments), 17::bigint, 'staff: org payments');
select is((select count(*) from public.profiles), 5::bigint, 'staff: org roster');
select is((select count(*) from public.app_settings), 1::bigint, 'staff: non-sensitive settings only');
select ok((select count(*) from public.inspection_checklist_template_items) > 0, 'staff: checklist items');
select is(
  (select count(*) from storage.objects where bucket_id = 'rental-inspection-photos'),
  2::bigint,
  'staff: all org inspection photos'
);

-- ---------------------------------------------------------------------------
-- Admin / owner
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select is((select count(*) from public.customers), 4::bigint, 'admin: all org customers');
select is((select count(*) from public.app_settings), 2::bigint, 'admin: sensitive settings too');
select is((select count(*) from public.profiles), 5::bigint, 'admin: org roster');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select is((select count(*) from public.rentals), 8::bigint, 'owner: all org rentals');

-- ---------------------------------------------------------------------------
-- Customer Dan: reaches his photo through the NEW `<rental>/file` path shape.
-- Alice above reaches hers through the legacy `<old-org>/<rental>/file` shape,
-- so between them both shapes are covered.
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000006","role":"authenticated","email":"dan@example.com"}';
select is(
  (select count(*) from storage.objects where bucket_id = 'rental-inspection-photos'),
  1::bigint,
  'customer: new-shape photo path resolves'
);
select ok(
  (select name from storage.objects where bucket_id = 'rental-inspection-photos')
    = 'e0000000-0000-4000-8000-000000000003/front.jpg',
  'customer: the visible photo is the tenant-free path'
);

-- ---------------------------------------------------------------------------
-- Registration is bootstrap-only. Multi-tenant this RPC minted a new
-- organization and made you its admin; single-tenant that would hand admin
-- over the one real company to anyone who signs up.
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000007","role":"authenticated","email":"newbie@zeke.test"}';
select throws_ok(
  $$select public.complete_self_service_registration('Nina Newbie')$$,
  '42501',
  'This workspace already has an administrator. Ask an owner to invite you.',
  'registration: refuses a second admin'
);

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select count(*) from public.customers $$,
  '42501',
  null,
  'anon: no table privilege on customers'
);
select is(
  (select count(*) from public.list_public_available_vehicles(null, null)),
  3::bigint,
  'anon: public fleet RPC works'
);

reset role;
select is(
  (select prosecdef from pg_proc where oid = 'private.is_org_staff()'::regprocedure),
  true,
  'is_org_staff is SECURITY DEFINER'
);

select * from finish(true);
rollback;
