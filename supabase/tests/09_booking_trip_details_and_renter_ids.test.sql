-- Migration 20261008100000: public booking collects trip details and two
-- renter ID photos (license selfie + second government ID) per booking.
begin;
set local search_path = public, extensions;
select plan(13);

create temp table _res (k text primary key, res jsonb) on commit drop;
grant all on _res to public;

-- Uploaded photo pairs; 0d09 has only a selfie.
insert into storage.objects (bucket_id, name)
select 'booking-ids', f || '/' || kind || '.jpg'
from unnest(array[
  '00000000-0000-4000-8000-000000000d01',
  '00000000-0000-4000-8000-000000000d02',
  '00000000-0000-4000-8000-000000000d03',
  '00000000-0000-4000-8000-000000000d04',
  '00000000-0000-4000-8000-000000000d05'
]) f
cross join unnest(array['license-selfie', 'government-id']) kind;
insert into storage.objects (bucket_id, name)
values ('booking-ids', '00000000-0000-4000-8000-000000000d09/license-selfie.jpg');

update public.vehicles set seating_capacity = 7
where id = 'c0000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- A new customer's full booking stores every field where it belongs
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'n1', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '110 days', now() + interval '111 days',
  'Frank Fresh', '09171112222', 'frank@example.com', 'L-FRANK',
  'Mactan Airport', 'IT Park', null,
  'Banilad, Cebu City', 'facebook.com/frank.fresh',
  'Oslob', 5,
  '00000000-0000-4000-8000-000000000d01/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000d01/government-id.jpg'
);
reset role;

select is(
  (select c.address || '|' || c.facebook_profile_url
     from public.rentals r join public.customers c on c.id = r.customer_id
    where r.id = ((select res from _res where k = 'n1') ->> 'rental_id')::uuid),
  'Banilad, Cebu City|facebook.com/frank.fresh',
  'new customer gets address and Facebook account'
);
select is(
  (select r.pickup_location || '|' || r.return_location || '|' || r.destination
          || '|' || r.passenger_count
     from public.rentals r
    where r.id = ((select res from _res where k = 'n1') ->> 'rental_id')::uuid),
  'Mactan Airport|IT Park|Oslob|5',
  'rental stores locations, destination and passengers'
);
select is(
  (select r.renter_license_selfie_path || '|' || r.renter_government_id_path
     from public.rentals r
    where r.id = ((select res from _res where k = 'n1') ->> 'rental_id')::uuid),
  '00000000-0000-4000-8000-000000000d01/license-selfie.jpg|00000000-0000-4000-8000-000000000d01/government-id.jpg',
  'rental stores both ID photo paths'
);

-- ---------------------------------------------------------------------------
-- Required trip details and ID photos
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       null, 2,
       '00000000-0000-4000-8000-000000000d02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d02/government-id.jpg') $$,
  '22023', 'Enter your destination.', 'destination is required'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', null,
       '00000000-0000-4000-8000-000000000d02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d02/government-id.jpg') $$,
  '22023', 'Enter how many passengers.', 'passenger count is required'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', 8,
       '00000000-0000-4000-8000-000000000d02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d02/government-id.jpg') $$,
  '22023', 'This car seats 7 passengers. Choose a bigger car or fewer passengers.',
  'passengers cannot exceed the car''s seats'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', 2,
       null,
       '00000000-0000-4000-8000-000000000d02/government-id.jpg') $$,
  '22023', 'Upload a selfie holding your driver''s license.', 'license selfie is required'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', 2,
       '00000000-0000-4000-8000-000000000d09/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d09/government-id.jpg') $$,
  '22023', 'Upload a photo of another government ID.',
  'an ID path that was never uploaded is rejected'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', 2,
       '00000000-0000-4000-8000-000000000d01/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d01/government-id.jpg') $$,
  '22023', 'Upload your ID photos again.',
  'ID photos already attached to another booking cannot be reused'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, 'Talamban, Cebu', 'fb.com/gina',
       'Bantayan', 2,
       '00000000-0000-4000-8000-000000000d02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d03/government-id.jpg') $$,
  '22023', 'Upload your ID photos again.',
  'both photos must come from one upload'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '120 days', now() + interval '121 days',
       'Gina New', '09173334444', null, 'L-GINA',
       'Airport', 'Airport', null, null, 'fb.com/gina',
       'Bantayan', 2,
       '00000000-0000-4000-8000-000000000d02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000d02/government-id.jpg') $$,
  '22023', 'Enter your complete address.', 'a new customer must give an address'
);
reset role;

-- ---------------------------------------------------------------------------
-- A matched customer's record is never edited; differences are noted
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'n2', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '130 days', now() + interval '131 days',
  null, '09171112222', null, null,
  'Airport', 'Airport', null,
  'Somewhere Else, Cebu', null,
  'Moalboal', 2,
  '00000000-0000-4000-8000-000000000d04/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000d04/government-id.jpg'
);
reset role;
select is(
  (select address from public.customers where email = 'frank@example.com'),
  'Banilad, Cebu City',
  'returning booking does not rewrite the customer address'
);
select ok(
  (select notes like '%address: Somewhere Else, Cebu%' from public.rentals
    where id = ((select res from _res where k = 'n2') ->> 'rental_id')::uuid),
  'a differing address is noted on the rental for staff'
);

select * from finish(true);
rollback;
