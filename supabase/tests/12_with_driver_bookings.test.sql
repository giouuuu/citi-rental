-- Migration 20261019090000: with-driver bookings add the owner's driver day
-- rate for every started 24 hours, saved on the rental and in quoted_total.
begin;
set local search_path = public, extensions;
select plan(12);

create temp table _res (k text primary key, res jsonb) on commit drop;
grant all on _res to public;

insert into storage.objects (bucket_id, name)
select 'booking-ids', f || '/' || kind || '.jpg'
from unnest(array[
  '00000000-0000-4000-8000-000000000e01',
  '00000000-0000-4000-8000-000000000e02',
  '00000000-0000-4000-8000-000000000e03',
  '00000000-0000-4000-8000-000000000e04'
]) f
cross join unnest(array['license-selfie', 'government-id']) kind;

update public.vehicles set seating_capacity = 5
where id = 'c0000000-0000-4000-8000-000000000003';
update public.company_profile set driver_daily_rate = 1000;

-- ---------------------------------------------------------------------------
-- Driver days: every started 24 hours, at least one
-- ---------------------------------------------------------------------------
select is(
  private.rental_driver_days(now(), now() + interval '24 hours'), 1,
  'exactly one day is one driver day'
);
select is(
  private.rental_driver_days(now(), now() + interval '25 hours'), 2,
  'an hour into the second day is a second driver day'
);
select is(
  private.rental_driver_days(now(), now() + interval '3 hours'), 1,
  'a short trip is still one driver day'
);

-- ---------------------------------------------------------------------------
-- The public rate
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.get_public_driver_daily_rate(), 1000.00, 'anyone can read the driver rate');

-- ---------------------------------------------------------------------------
-- Self-drive and with-driver bookings
-- ---------------------------------------------------------------------------
insert into _res (k, res)
select 'self', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '130 days', now() + interval '131 days',
  'Ivy Self', '09175550001', 'ivy@example.com', 'L-IVY',
  'Mactan Airport', 'Mactan Airport', null,
  'Lahug, Cebu City', 'facebook.com/ivy.self',
  'Moalboal', 2,
  '00000000-0000-4000-8000-000000000e01/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000e01/government-id.jpg'
);
insert into _res (k, res)
select 'driver', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '140 days', now() + interval '141 days 12 hours',
  'Jun Driver', '09175550002', 'jun@example.com', 'L-JUN',
  'Mactan Airport', 'Mactan Airport', null,
  'Mabolo, Cebu City', 'facebook.com/jun.driver',
  'Oslob', 4,
  '00000000-0000-4000-8000-000000000e02/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000e02/government-id.jpg',
  true
);
reset role;

select is(
  (select r.with_driver::text || '|' || r.driver_fee from public.rentals r
    where r.id = ((select res from _res where k = 'self') ->> 'rental_id')::uuid),
  'false|0.00',
  'a booking without the flag is self-drive with no driver fee'
);
select is(
  (select r.with_driver::text || '|' || r.driver_daily_rate || '|' || r.driver_days
          || '|' || r.driver_fee
     from public.rentals r
    where r.id = ((select res from _res where k = 'driver') ->> 'rental_id')::uuid),
  'true|1000.00|2|2000.00',
  '36 hours with a driver is two driver days at the set rate'
);
select is(
  (select r.quoted_total - r.driver_fee
     from public.rentals r
    where r.id = ((select res from _res where k = 'driver') ->> 'rental_id')::uuid),
  (select q.total
     from public.rentals r,
     lateral private.rental_rent_quote(
       r.start_at, r.expected_return_at,
       r.quoted_daily_rate, r.quoted_half_day_rate, r.quoted_hourly_rate
     ) q
    where r.id = ((select res from _res where k = 'driver') ->> 'rental_id')::uuid),
  'the quoted total is the car rent plus the driver fee'
);
select is(
  (select r.balance_due from public.rentals r
    where r.id = ((select res from _res where k = 'driver') ->> 'rental_id')::uuid),
  (select r.quoted_total - r.deposit_amount from public.rentals r
    where r.id = ((select res from _res where k = 'driver') ->> 'rental_id')::uuid),
  'the balance includes the driver fee'
);
select is(
  ((select res from _res where k = 'driver') ->> 'driver_fee')::numeric,
  2000.00,
  'the booking result returns the driver fee'
);

-- ---------------------------------------------------------------------------
-- The driver takes a seat
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '150 days', now() + interval '151 days',
       'Kai Full', '09175550003', null, 'L-KAI',
       'Airport', 'Airport', null, 'Talisay, Cebu', 'fb.com/kai',
       'Bantayan', 5,
       '00000000-0000-4000-8000-000000000e03/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000e03/government-id.jpg',
       true) $$,
  '22023', 'With a driver, this car seats 4 passengers. Choose a bigger car or fewer passengers.',
  'with a driver, one seat goes to the driver'
);
reset role;

-- ---------------------------------------------------------------------------
-- No rate set: the request is saved, staff quote the driver
-- ---------------------------------------------------------------------------
update public.company_profile set driver_daily_rate = null;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'unpriced', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '160 days', now() + interval '161 days',
  'Lea Later', '09175550004', 'lea@example.com', 'L-LEA',
  'Airport', 'Airport', null, 'Mandaue, Cebu', 'fb.com/lea',
  'Badian', 2,
  '00000000-0000-4000-8000-000000000e04/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000e04/government-id.jpg',
  true
);
reset role;

select is(
  (select r.with_driver::text || '|' || coalesce(r.driver_daily_rate::text, 'null')
          || '|' || r.driver_fee
     from public.rentals r
    where r.id = ((select res from _res where k = 'unpriced') ->> 'rental_id')::uuid),
  'true|null|0.00',
  'with no rate set, the driver request is saved without a fee'
);
select is(
  public.get_public_driver_daily_rate(), null,
  'the public rate is empty when none is set'
);

select * from finish(true);
rollback;
