-- Committed fixture data for supabase/tests/*.test.sql (local verification only).
-- Applied as `postgres` (BYPASSRLS) after all migrations by
-- scripts/verify-migrations.sh. Every test file runs in its own transaction and
-- rolls back, so tests always start from exactly this state.
--
-- All fixed timestamps are Manila local time (+08). The analytics window used
-- by the tests is 2026-03-01..2026-03-10 ("W").
--
-- Org A  aaaaaaaa-…  "Zeke Test Rentals" (public site)
--   users   owner 0a…01, admin 0a…02, staff 0a…03,
--           customer Alice 0a…04 (alice@example.com),
--           customer Mallory 0a…05 (mallory@evil.test, attacker)
--   vehicles V1 AAA 111, V2 BBB 222, V3 CCC 333 (idle, created 2026-03-06),
--            V4 DDD 444 (inactive), V5 EEE 555 (maintenance)
--   customers C1 Alice, C2 Bob (no email), C3 Carol (blocked), C4 Dan

-- ---------------------------------------------------------------------------
-- Company profile (singleton)
-- ---------------------------------------------------------------------------
update public.company_profile set
  id = 'aaaaaaaa-0000-4000-8000-000000000001',
  name = 'Zeke Test Rentals',
  slug = 'zeke-test',
  is_active = true,
  show_on_public_site = true,
  created_at = '2025-12-01 00:00+08';

-- ---------------------------------------------------------------------------
-- Auth users + profiles (provider 'email' so the Google trigger skips them)
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at)
values
  ('0000000a-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@zeke.test', '{"provider":"email"}', '{}', now()),
  ('0000000a-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@zeke.test', '{"provider":"email"}', '{}', now()),
  ('0000000a-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'staff@zeke.test', '{"provider":"email"}', '{}', now()),
  ('0000000a-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'alice@example.com', '{"provider":"email"}', '{}', now()),
  ('0000000a-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'mallory@evil.test', '{"provider":"email"}', '{}', now()),
  -- Dan has a customers row (matched by email) but no profile.
  ('0000000a-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'dan@example.com', '{"provider":"email"}', '{}', now()),
  -- Newbie has neither, for the registration bootstrap guard.
  ('0000000a-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'newbie@zeke.test', '{"provider":"email"}', '{}', now());

insert into public.profiles (id, full_name, role, is_active)
values
  ('0000000a-0000-4000-8000-000000000001', 'Olive Owner', 'owner', true),
  ('0000000a-0000-4000-8000-000000000002', 'Adam Admin', 'admin', true),
  ('0000000a-0000-4000-8000-000000000003', 'Stan Staff', 'staff', true),
  ('0000000a-0000-4000-8000-000000000004', 'Alice Renter', 'customer', true),
  ('0000000a-0000-4000-8000-000000000005', 'Mallory Evil', 'customer', true);

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
insert into public.vehicles (id, plate_number, name, make, model, year, category, status, daily_rate, created_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'AAA 111', 'Vios One', 'Toyota', 'Vios', 2023, 'Sedan', 'available', 2000, '2026-01-01 08:00+08'),
  ('c0000000-0000-4000-8000-000000000002', 'BBB 222', 'City Two', 'Honda', 'City', 2022, 'Sedan', 'available', 3000, '2026-01-01 08:00+08'),
  ('c0000000-0000-4000-8000-000000000003', 'CCC 333', 'Innova Idle', 'Toyota', 'Innova', 2024, 'MPV', 'available', 2500, '2026-03-06 10:00+08'),
  ('c0000000-0000-4000-8000-000000000004', 'DDD 444', 'Retired Four', 'Ford', 'Ranger', 2020, 'Pickup', 'inactive', 2000, '2026-01-01 08:00+08'),
  ('c0000000-0000-4000-8000-000000000005', 'EEE 555', 'Shop Five', 'Hyundai', 'Staria', 2024, 'Van', 'maintenance', 4000, '2026-01-01 08:00+08');

-- Full 6-photo galleries for the available cars, so they show on the public
-- site and take online bookings.
insert into public.vehicle_photos (vehicle_id, kind, storage_path, public_url)
select
  v.id::uuid,
  k.kind::public.vehicle_photo_kind,
  v.id || '/' || k.kind || '.jpg',
  'https://photos.test/' || v.id || '/' || k.kind || '.jpg'
from (values
  ('c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000003')
) v(id)
cross join unnest(array['front', 'rear', 'left', 'right', 'interior', 'dashboard']) k(kind);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
insert into public.customers (id, full_name, email, phone_number, drivers_license_number, is_blocked, tracking_consent_at, tracking_disclosure_version, created_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'Alice Renter', 'alice@example.com', '09170000001', 'L-A1', false, null, null, '2026-01-01 08:00+08'),
  ('d0000000-0000-4000-8000-000000000002', 'Bob Builder', null, '09170000002', 'L-B2', false, null, null, '2026-01-01 08:00+08'),
  ('d0000000-0000-4000-8000-000000000003', 'Carol Blocked', 'carol@example.com', '09170000003', 'L-C3', true, null, null, '2026-01-01 08:00+08'),
  ('d0000000-0000-4000-8000-000000000004', 'Dan Driver', 'dan@example.com', '09170000004', 'L-D4', false, '2026-03-01 00:00+08', 'v1', '2026-03-01 08:00+08');

-- ---------------------------------------------------------------------------
-- Rentals (org A). See supabase/tests/04_analytics.test.sql for the
-- hand-computed expectations derived from these rows.
-- ---------------------------------------------------------------------------
insert into public.rentals (
  id, reference_number, customer_id, vehicle_id,
  start_at, expected_return_at, actual_return_at, status, tracking_consent_at,
  quoted_total, booking_source, cancelled_at, cancellation_reason, created_at
)
values
  -- R0 Carol V2 completed in January (makes Carol a returning customer)
  ('e0000000-0000-4000-8000-000000000000', 'OPS-000',
   'd0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   '2026-01-10 10:00+08', '2026-01-12 10:00+08', '2026-01-12 10:00+08', 'completed', null,
   6000, 'ops', null, null, '2026-01-05 10:00+08'),
  -- R1 Alice V1 completed, returned 2h late on 03-02 (late return)
  ('e0000000-0000-4000-8000-000000000001', 'OPS-001',
   'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '2026-02-27 10:00+08', '2026-03-02 10:00+08', '2026-03-02 12:00+08', 'completed', null,
   8000, 'ops', null, null, '2026-02-20 10:00+08'),
  -- R2 Alice V2 completed, public web booking, returned early
  ('e0000000-0000-4000-8000-000000000002', 'WEB-260301-AAAAAA',
   'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
   '2026-03-03 10:00+08', '2026-03-05 10:00+08', '2026-03-05 09:00+08', 'completed', null,
   6000, 'public_web', null, null, '2026-03-01 09:00+08'),
  -- R3 Dan V1 still ACTIVE, expected back 03-09 (overdue now, occupies until now())
  ('e0000000-0000-4000-8000-000000000003', 'OPS-003',
   'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001',
   '2026-03-08 10:00+08', '2026-03-09 10:00+08', null, 'active', '2026-03-08 10:00+08',
   4000, 'ops', null, null, '2026-03-07 10:00+08'),
  -- R4 Bob V2 cancelled on 03-06 (customer request)
  ('e0000000-0000-4000-8000-000000000004', 'OPS-004',
   'd0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   '2026-03-12 10:00+08', '2026-03-13 10:00+08', null, 'cancelled', null,
   3000, 'ops', '2026-03-06 10:00+08', 'customer_request', '2026-03-04 10:00+08'),
  -- R5 Dan V2 RESERVED in the real future: today+2 10:00 .. today+4 10:00 (Manila)
  ('e0000000-0000-4000-8000-000000000005', 'OPS-005',
   'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002',
   ((now() at time zone 'Asia/Manila')::date + 2 + time '10:00') at time zone 'Asia/Manila',
   ((now() at time zone 'Asia/Manila')::date + 4 + time '10:00') at time zone 'Asia/Manila',
   null, 'reserved', null,
   6000, 'ops', null, null, now()),
  -- R6 Carol (blocked now) V4 (inactive now) completed inside W
  ('e0000000-0000-4000-8000-000000000006', 'OPS-006',
   'd0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000004',
   '2026-03-02 10:00+08', '2026-03-04 10:00+08', '2026-03-04 10:00+08', 'completed', null,
   4000, 'ops', null, null, '2026-02-25 10:00+08'),
  -- R7 Bob V1 draft created inside W, for April
  ('e0000000-0000-4000-8000-000000000007', 'OPS-007',
   'd0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   '2026-04-01 10:00+08', '2026-04-02 10:00+08', null, 'draft', null,
   null, 'ops', null, null, '2026-03-09 10:00+08');

-- ---------------------------------------------------------------------------
-- Payments ledger (inserted directly: balance_due is intentionally NOT
-- refreshed, analytics must compute outstanding from the ledger)
-- ---------------------------------------------------------------------------
insert into public.payments (
  id, rental_id, payment_type, amount, method, status, submitted_at, confirmed_at
)
values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'deposit',    2400, 'gcash', 'confirmed', '2026-02-21 10:00+08', '2026-02-21 10:00+08'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'balance',    5600, 'cash',  'confirmed', '2026-03-02 12:30+08', '2026-03-02 12:30+08'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'penalty',     500, 'other', 'confirmed', '2026-03-02 12:15+08', '2026-03-02 12:15+08'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'balance',     500, 'cash',  'confirmed', '2026-03-03 10:00+08', '2026-03-03 10:00+08'),
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', 'deposit',    1800, 'gcash', 'confirmed', '2026-03-01 10:00+08', '2026-03-01 10:00+08'),
  ('f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000002', 'balance',    4200, 'cash',  'confirmed', '2026-03-05 10:00+08', '2026-03-05 10:00+08'),
  ('f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000002', 'refund',      300, 'cash',  'confirmed', '2026-03-06 10:00+08', '2026-03-06 10:00+08'),
  ('f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000003', 'deposit',    1200, 'gcash', 'confirmed', '2026-03-07 10:00+08', '2026-03-07 10:00+08'),
  ('f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000003', 'balance',    1000, 'gcash', 'submitted', '2026-03-08 10:00+08', null),
  ('f0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000006', 'deposit',    2000, 'cash',  'confirmed', '2026-03-02 10:00+08', '2026-03-02 10:00+08'),
  ('f0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000004', 'deposit',     900, 'gcash', 'confirmed', '2026-03-04 10:00+08', '2026-03-04 10:00+08'),
  ('f0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000004', 'refund',      900, 'gcash', 'confirmed', '2026-03-06 11:00+08', '2026-03-06 11:00+08'),
  ('f0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000003', 'penalty',     200, 'other', 'confirmed', '2026-03-12 10:00+08', '2026-03-12 10:00+08'),
  ('f0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000000', 'deposit',    6000, 'cash',  'confirmed', '2026-01-12 10:00+08', '2026-01-12 10:00+08'),
  -- window-boundary probes (Manila midnight)
  ('f0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000002', 'adjustment',   50, 'cash',  'confirmed', '2026-03-11 00:00+08', '2026-03-11 00:00+08'),
  ('f0000000-0000-4000-8000-000000000016', 'e0000000-0000-4000-8000-000000000002', 'adjustment',   25, 'cash',  'confirmed', '2026-02-28 23:59:59+08', '2026-02-28 23:59:59+08'),
  ('f0000000-0000-4000-8000-000000000017', 'e0000000-0000-4000-8000-000000000006', 'adjustment',   10, 'cash',  'confirmed', '2026-03-10 23:59+08', '2026-03-10 23:59+08');

-- ---------------------------------------------------------------------------
-- Misc rows used by the RLS tests
-- ---------------------------------------------------------------------------
insert into public.drivers (full_name, phone_number, drivers_license_number)
values ('Drew Driver', '09171111111', 'DL-1');

insert into public.app_settings (setting_key, setting_value, is_sensitive)
values
  ('gps.provider', '"simulator"', false),
  ('traccar.token', '"secret"', true);

select private.ensure_default_inspection_template();

-- Inspection photo objects. One legacy `<old-org>/<rental>/file` name and one
-- new `<rental>/file` name, so the suite covers both path shapes.
insert into storage.objects (bucket_id, name)
values
  ('rental-inspection-photos', 'aaaaaaaa-0000-4000-8000-000000000001/e0000000-0000-4000-8000-000000000001/front.jpg'),
  ('rental-inspection-photos', 'e0000000-0000-4000-8000-000000000003/front.jpg');
