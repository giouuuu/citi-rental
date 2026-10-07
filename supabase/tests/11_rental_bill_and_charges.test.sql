-- Migration 20261009090000: photos gate the public site (not `available`),
-- ops rentals keep balance_due in step with their quote, charge types,
-- add/void charges, and extend_rental.
begin;
set local search_path = public, extensions;
select plan(33);

-- ---------------------------------------------------------------------------
-- Setup (as postgres): a new car with no photos, and rentals to bill
-- ---------------------------------------------------------------------------
insert into public.vehicles (id, plate_number, name, make, model, year, category, status, daily_rate)
values ('c0000000-0000-4000-8000-000000000006', 'FFF 666', 'No Photos Six', 'Toyota', 'Wigo', 2024, 'Hatchback', 'maintenance', 1500);

select lives_ok(
  $$ update public.vehicles set status = 'available' where id = 'c0000000-0000-4000-8000-000000000006' $$,
  'a car with no photos can be set to available'
);
select ok(
  not exists (select 1 from public.list_public_available_vehicles(null, null) where id = 'c0000000-0000-4000-8000-000000000006'),
  'a car missing photos is not listed on the public site'
);
select is(
  (select status::text from public.get_public_vehicle('c0000000-0000-4000-8000-000000000006')),
  'maintenance',
  'a car missing photos reads as maintenance on its public page'
);
select is(
  (select count(*) from public.list_public_available_vehicles(null, null)),
  3::bigint,
  'cars with full galleries are still listed'
);
select throws_ok(
  $$ insert into public.rentals (reference_number, customer_id, vehicle_id, start_at, expected_return_at, status, booking_source)
     values ('WEB-NOPHOTO', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006',
             now() + interval '10 days', now() + interval '12 days', 'reserved', 'public_web') $$,
  '23514',
  'This car is not open for online booking yet. Please choose another car.',
  'an online booking on a car missing photos is refused'
);

-- Ops rental on the photo-less car, with a manual quote.
insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status,
  quoted_daily_rate, quoted_days, quoted_total, booking_source)
values ('e0000000-0000-4000-8000-000000000020', 'OPS-020', 'd0000000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-000000000006', now() + interval '10 days', now() + interval '12 days', 'reserved',
  1500, 3, 4500, 'ops');

select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000020'),
  4500.00::numeric,
  'an ops rental gets balance_due from its quote on insert'
);
update public.rentals set quoted_daily_rate = 2000, quoted_total = 6000
where id = 'e0000000-0000-4000-8000-000000000020';
select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000020'),
  6000.00::numeric,
  'changing the quote refreshes balance_due'
);

-- An active rental on V2 ending before R5 (reserved today+2 .. today+4).
insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status,
  tracking_consent_at, quoted_total, booking_source)
values ('e0000000-0000-4000-8000-000000000021', 'OPS-021', 'd0000000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-000000000002', now() - interval '1 day', now() + interval '1 day', 'active',
  now() - interval '1 day', 3000, 'ops');

-- R3 is active and past its return: mark it overdue.
update public.rentals set status = 'overdue' where id = 'e0000000-0000-4000-8000-000000000003';

-- An archived charge type.
insert into public.rental_charge_types (id, name, is_active)
values ('a1000000-0000-4000-8000-000000000001', 'Old fee', false);

-- ---------------------------------------------------------------------------
-- Charge types: staff read, only owner/admin write, customers see nothing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select is((select count(*) from public.rental_charge_types), 0::bigint, 'customer: no charge types visible');
select throws_ok(
  $$ select public.add_rental_charge('e0000000-0000-4000-8000-000000000020',
       (select id from public.rental_charge_types where code = 'delivery'), 500, null) $$,
  '42501', null, 'customer cannot add a charge'
);

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select is(
  (select count(*) from public.rental_charge_types where code is not null),
  6::bigint,
  'staff: sees the 6 built-in charge types'
);
select throws_ok(
  $$ insert into public.rental_charge_types (name) values ('Staff fee') $$,
  '42501', null, 'staff cannot create charge types'
);

-- ---------------------------------------------------------------------------
-- add_rental_charge / void_rental_charge
-- ---------------------------------------------------------------------------
select isnt(
  public.add_rental_charge('e0000000-0000-4000-8000-000000000020',
    (select id from public.rental_charge_types where code = 'delivery'), 500, 'Mactan airport'),
  null,
  'staff adds a delivery charge'
);
select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000020'),
  6500.00::numeric,
  'the charge raises balance_due'
);
select is(
  (select ct.code || '|' || p.payment_type::text || '|' || p.status::text || '|' || p.notes
     from public.payments p join public.rental_charge_types ct on ct.id = p.charge_type_id
     where p.rental_id = 'e0000000-0000-4000-8000-000000000020'),
  'delivery|penalty|confirmed|Mactan airport',
  'the charge is a confirmed penalty row tagged with its type'
);
select throws_ok(
  $$ select public.add_rental_charge('e0000000-0000-4000-8000-000000000020',
       'a1000000-0000-4000-8000-000000000001', 100, null) $$,
  '22023', 'That charge type is archived. Choose another.', 'an archived charge type is refused'
);
select throws_ok(
  $$ select public.add_rental_charge('e0000000-0000-4000-8000-000000000020',
       (select id from public.rental_charge_types where code = 'car_wash'), 0, null) $$,
  '22023', 'Amount must be greater than zero.', 'a zero charge is refused'
);
select throws_ok(
  $$ select public.add_rental_charge('e0000000-0000-4000-8000-000000000004',
       (select id from public.rental_charge_types where code = 'car_wash'), 300, null) $$,
  '23514', 'Cancelled rentals cannot take new charges.', 'a cancelled rental takes no charges'
);
select throws_ok(
  $$ select public.void_rental_charge((select id from public.payments
       where rental_id = 'e0000000-0000-4000-8000-000000000020' and payment_type = 'penalty')) $$,
  '42501', null, 'staff cannot remove a charge'
);
select is(
  (public.record_rental_payment('e0000000-0000-4000-8000-000000000020', 'balance', 1000, 'cash', null, null, true)) ->> 'success',
  'true',
  'staff records a payment'
);
select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000020'),
  5500.00::numeric,
  'the payment lowers balance_due'
);

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select lives_ok(
  $$ select public.void_rental_charge((select id from public.payments
       where rental_id = 'e0000000-0000-4000-8000-000000000020' and payment_type = 'penalty')) $$,
  'owner removes the charge'
);
select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000020'),
  5000.00::numeric,
  'removing the charge lowers balance_due again'
);
select throws_ok(
  $$ select public.void_rental_charge((select id from public.payments
       where rental_id = 'e0000000-0000-4000-8000-000000000020' and payment_type = 'penalty')) $$,
  'P0002', null, 'a removed charge cannot be removed twice'
);
select lives_ok(
  $$ insert into public.rental_charge_types (name, default_amount) values ('Seat cover', 150) $$,
  'owner creates a charge type'
);

-- ---------------------------------------------------------------------------
-- extend_rental
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';

select is(
  (public.extend_rental('e0000000-0000-4000-8000-000000000003', now() + interval '1 day', 2000, 'Customer called')) ->> 'success',
  'true',
  'staff extends an overdue rental'
);
select is(
  (select status::text from public.rentals where id = 'e0000000-0000-4000-8000-000000000003'),
  'active',
  'an overdue rental extended into the future is active again'
);
select is(
  (select expected_return_at from public.rentals where id = 'e0000000-0000-4000-8000-000000000003'),
  now() + interval '1 day',
  'the return date moved'
);
select is(
  (select ct.code || '|' || p.amount::text from public.payments p
     join public.rental_charge_types ct on ct.id = p.charge_type_id
     where p.rental_id = 'e0000000-0000-4000-8000-000000000003' and ct.code = 'extension'),
  'extension|2000.00',
  'the extension charge is on the bill'
);
select is(
  (public.extend_rental('e0000000-0000-4000-8000-000000000003', now() + interval '2 days', null, null)) ->> 'payment_id',
  null,
  'an extension without an amount adds no charge'
);
select throws_ok(
  $$ select public.extend_rental('e0000000-0000-4000-8000-000000000003', now(), null, null) $$,
  '23514', 'The new return must be later than the current one.', 'cannot extend to an earlier return'
);
select throws_ok(
  $$ select public.extend_rental('e0000000-0000-4000-8000-000000000021',
       now() + interval '3 days', 1000, null) $$,
  '23P01', null, 'an extension into the next booking is blocked'
);
select is(
  (select count(*) from public.payments where rental_id = 'e0000000-0000-4000-8000-000000000021'),
  0::bigint,
  'a blocked extension adds no charge'
);
select throws_ok(
  $$ select public.extend_rental('e0000000-0000-4000-8000-000000000005', now() + interval '10 days', null, null) $$,
  '23514', null, 'a rental that has not started cannot be extended'
);

select * from finish(true);
rollback;
