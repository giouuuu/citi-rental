-- Migrations 20260929101000 (identity hardening) + 20260929102000 (booking_source):
-- a public booking never rewrites a matched customer's identity, and every
-- public booking is stamped booking_source = 'public_web' with a WEB- reference.
begin;
set local search_path = public, extensions;
select plan(23);

-- Results are captured in one temp table created by the session owner and
-- opened to every role, so impersonated calls can write and later reads work.
create temp table _res (k text primary key, res jsonb) on commit drop;
grant all on _res to public;

-- ---------------------------------------------------------------------------
-- Attack 1: anonymous caller with the victim's PHONE and the attacker's email
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

insert into _res (k, res)
select 'b1', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '10 days',
  now() + interval '12 days',
  'Mallory Evil',
  '09170000002',               -- Bob's phone
  'mallory@evil.test',
  'L-MALLORY',
  'Airport',
  null,
  null
);

reset role;

select is(
  (select email from public.customers where id = 'd0000000-0000-4000-8000-000000000002'),
  null,
  'anon + victim phone: victim email NOT overwritten'
);
select is(
  (select full_name from public.customers where id = 'd0000000-0000-4000-8000-000000000002'),
  'Bob Builder',
  'anon + victim phone: victim name NOT overwritten'
);
select is(
  (select drivers_license_number from public.customers where id = 'd0000000-0000-4000-8000-000000000002'),
  'L-B2',
  'anon + victim phone: victim license NOT overwritten'
);
select is(
  (select r.customer_id from public.rentals r
    where r.id = ((select res from _res where k = 'b1') ->> 'rental_id')::uuid),
  'd0000000-0000-4000-8000-000000000002'::uuid,
  'booking is still attached to the matched customer for staff to reconcile'
);
select ok(
  (select r.notes from public.rentals r
    where r.id = ((select res from _res where k = 'b1') ->> 'rental_id')::uuid)
    like '%Contact details supplied at booking%mallory@evil.test%',
  'differing contact details are appended to the rental notes'
);
select is(
  (select r.booking_source from public.rentals r
    where r.id = ((select res from _res where k = 'b1') ->> 'rental_id')::uuid),
  'public_web',
  'public booking stamped booking_source = public_web'
);
select ok(
  ((select res from _res where k = 'b1') ->> 'reference_number') like 'WEB-%',
  'public booking keeps the WEB- reference'
);
select is(
  (select r.status::text from public.rentals r
    where r.id = ((select res from _res where k = 'b1') ->> 'rental_id')::uuid),
  'draft',
  'public booking is still a draft awaiting deposit'
);

-- Mallory signs in: she must not see Bob's bookings.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000005","role":"authenticated","email":"mallory@evil.test"}';
select is((select count(*) from public.list_my_bookings()), 0::bigint,
  'attacker sees none of the victim''s bookings after the anonymous booking');

-- ---------------------------------------------------------------------------
-- Attack 2: SIGNED-IN attacker with the victim's phone (victim has no email)
-- ---------------------------------------------------------------------------
insert into _res (k, res)
select 'b2', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '20 days',
  now() + interval '21 days',
  'Mallory Evil',
  '09170000002',
  'mallory@evil.test',
  'L-MALLORY',
  null, null, null
);

select is((select count(*) from public.list_my_bookings()), 0::bigint,
  'signed-in attacker still sees none of the victim''s bookings');
reset role;
select is(
  (select email from public.customers where id = 'd0000000-0000-4000-8000-000000000002'),
  null,
  'signed-in attacker cannot attach their email to an email-less victim'
);

-- ---------------------------------------------------------------------------
-- Attack 3: anonymous caller with the victim's EMAIL and a new phone
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'b3', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '30 days',
  now() + interval '31 days',
  'Not Alice',
  '09175550000',
  'ALICE@example.com',
  'L-NOT-ALICE',
  null, null, null
);
reset role;
select is(
  (select full_name || '|' || phone_number || '|' || drivers_license_number
     from public.customers where id = 'd0000000-0000-4000-8000-000000000001'),
  'Alice Renter|09170000001|L-A1',
  'anon + victim email: name/phone/license NOT overwritten'
);

-- ---------------------------------------------------------------------------
-- Legitimate flows
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'b4', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '40 days',
  now() + interval '42 days',
  'Erin Newcomer',
  '09179999999',
  'erin@example.com',
  'L-ERIN',
  null, null, null
);
reset role;
select is(
  (select c.full_name || '|' || c.email || '|' || c.phone_number || '|' || c.drivers_license_number
     from public.rentals r join public.customers c on c.id = r.customer_id
    where r.id = ((select res from _res where k = 'b4') ->> 'rental_id')::uuid),
  'Erin Newcomer|erin@example.com|09179999999|L-ERIN',
  'new customer is created from the payload'
);
select is(
  (select booking_source from public.rentals
    where id = ((select res from _res where k = 'b4') ->> 'rental_id')::uuid),
  'public_web',
  'new-customer booking is public_web'
);
select is(
  (select notes from public.rentals
    where id = ((select res from _res where k = 'b4') ->> 'rental_id')::uuid),
  'Booked online by customer — awaiting deposit',
  'no reconciliation note when there is no matched customer'
);

-- Same person books again with identical details: no reconciliation note.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'b5', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '50 days',
  now() + interval '51 days',
  'Erin Newcomer',
  '09179999999',
  'erin@example.com',
  'L-ERIN',
  null, null, null
);
reset role;
select is(
  (select customer_id from public.rentals where id = ((select res from _res where k = 'b5') ->> 'rental_id')::uuid),
  (select customer_id from public.rentals where id = ((select res from _res where k = 'b4') ->> 'rental_id')::uuid),
  'repeat booking reuses the same customer'
);
select is(
  (select notes from public.rentals where id = ((select res from _res where k = 'b5') ->> 'rental_id')::uuid),
  'Booked online by customer — awaiting deposit',
  'identical details: no reconciliation note'
);

-- Signed-in Alice books: matched by her verified email, her rental is visible to her.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
insert into _res (k, res)
select 'b6', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '60 days',
  now() + interval '61 days',
  'Alice Renter',
  '09170000001',
  'alice@example.com',
  'L-A1',
  null, null, null
);
select is((select count(*) from public.list_my_bookings()), 4::bigint,
  'signed-in customer sees their new booking (2 seeded + attack-3 + this one)');
reset role;
select is(
  (select customer_id from public.rentals where id = ((select res from _res where k = 'b6') ->> 'rental_id')::uuid),
  'd0000000-0000-4000-8000-000000000001'::uuid,
  'signed-in booking attaches to the email-matched customer'
);

-- Blocked customer behaviour unchanged.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '70 days', now() + interval '71 days',
       'Carol Blocked', '09170000003', null, 'L-C3', null, null, null) $$,
  'P0001',
  'Your customer profile cannot book right now. Please contact support.',
  'blocked customer still cannot book'
);
reset role;

-- Ops-created rentals default to booking_source = ops.
insert into public.rentals (
  reference_number, customer_id, vehicle_id,
  start_at, expected_return_at, status
) values (
  'OPS-NEW',
  'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003',
  now() + interval '80 days', now() + interval '81 days', 'draft'
);
select is(
  (select booking_source from public.rentals where reference_number = 'OPS-NEW'),
  'ops',
  'ops rentals default to booking_source = ops'
);
select throws_ok(
  $$ update public.rentals set booking_source = 'phone' where reference_number = 'OPS-NEW' $$,
  '23514',
  null,
  'booking_source is constrained'
);
select is(
  (select prosecdef from pg_proc
    where oid = 'public.create_public_booking(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text)'::regprocedure),
  true,
  'create_public_booking remains SECURITY DEFINER'
);

select * from finish(true);
rollback;
