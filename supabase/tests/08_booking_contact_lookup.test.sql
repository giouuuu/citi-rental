-- Migration 20261008090000: guest booking contact lookup.
-- Exact-match, service_role-only lookup with a per-client rate limit, and
-- create_public_booking accepting a returning customer's trip-only payload.
begin;
set local search_path = public, extensions;
select plan(19);

create temp table _res (k text primary key, res jsonb) on commit drop;
grant all on _res to public;

-- Renter ID photos each booking below uploads to booking-ids first.
insert into storage.objects (bucket_id, name)
select 'booking-ids', f || '/' || kind || '.jpg'
from unnest(array[
  '00000000-0000-4000-8000-000000000c01',
  '00000000-0000-4000-8000-000000000c02',
  '00000000-0000-4000-8000-000000000c03'
]) f
cross join unnest(array['license-selfie', 'government-id']) kind;

-- ---------------------------------------------------------------------------
-- Phone normalization
-- ---------------------------------------------------------------------------
select is(private.normalize_phone('0917 000 0001'), '+639170000001', 'local PH mobile');
select is(private.normalize_phone('+63 (917) 000-0001'), '+639170000001', 'international PH mobile');
select is(private.normalize_phone('9170000001'), '+639170000001', 'PH mobile without prefix');
select is(private.normalize_phone('+1 555 010 9999'), '+15550109999', 'non-PH keeps +digits');
select is(private.normalize_phone('  '), null, 'blank is null');

-- ---------------------------------------------------------------------------
-- Grants: only service_role may call the lookup
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.lookup_booking_contact(text, text, text)', 'execute'),
  'anon cannot call lookup_booking_contact (Turnstile cannot be skipped)'
);
select ok(
  not has_function_privilege('authenticated', 'public.lookup_booking_contact(text, text, text)', 'execute'),
  'authenticated cannot call lookup_booking_contact'
);
select ok(
  has_function_privilege('service_role', 'public.lookup_booking_contact(text, text, text)', 'execute'),
  'service_role can call lookup_booking_contact'
);

-- ---------------------------------------------------------------------------
-- Lookup results
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  public.lookup_booking_contact('ALICE@example.com', null, null),
  '{"returning": true, "initial": "A"}'::jsonb,
  'exact email match is returning and reveals only an initial'
);
select is(
  public.lookup_booking_contact(null, '+63 917 000 0002', null),
  '{"returning": true, "initial": "B"}'::jsonb,
  'phone matches across formats (stored 0917…, typed +63 917…)'
);
select is(
  public.lookup_booking_contact('alice@example.co', null, null),
  '{"returning": false}'::jsonb,
  'no prefix or fuzzy match'
);
select throws_ok(
  $$ select public.lookup_booking_contact('alice@example', null, null) $$,
  '22023',
  'Enter your full email address.',
  'incomplete email is rejected'
);
select throws_ok(
  $$ select public.lookup_booking_contact('alice@example.com', '09170000001', null) $$,
  '22023',
  'Enter an email or a mobile number.',
  'exactly one identifier per lookup'
);

-- Rate limit: 10 lookups per client per 10 minutes.
select lives_ok(
  $$ select public.lookup_booking_contact(null, '0917000' || lpad(g::text, 4, '0'), 'client-a')
     from generate_series(1, 10) g $$,
  'ten lookups from one client are allowed'
);
select throws_ok(
  $$ select public.lookup_booking_contact('alice@example.com', null, 'client-a') $$,
  'P0001',
  'Too many lookups. Wait a few minutes and try again.',
  'the eleventh lookup is refused'
);
select lives_ok(
  $$ select public.lookup_booking_contact('alice@example.com', null, 'client-b') $$,
  'other clients are unaffected'
);
reset role;

-- ---------------------------------------------------------------------------
-- Returning-customer booking: trip details + identifier only
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'r1', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '90 days',
  now() + interval '91 days',
  null,
  '+63 917 000 0002',
  null,
  null,
  'Airport',
  'Airport',
  null,
  null,
  null,
  'Moalboal',
  2,
  '00000000-0000-4000-8000-000000000c01/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000c01/government-id.jpg'
);
reset role;
select is(
  (select customer_id || '|' || notes from public.rentals
    where id = ((select res from _res where k = 'r1') ->> 'rental_id')::uuid),
  'd0000000-0000-4000-8000-000000000002|Booked online by customer — awaiting deposit',
  'returning phone booking attaches to Bob with no reconciliation note'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '95 days',
       now() + interval '96 days',
       null,
       null,
       'stranger@example.com',
       null,
       'Airport',
       'Airport',
       null,
       null,
       null,
       'Moalboal',
       2,
       '00000000-0000-4000-8000-000000000c02/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000c02/government-id.jpg'
     ) $$,
  '22023',
  'Enter your full name.',
  'unknown contact cannot skip identity fields'
);
select throws_ok(
  $$ select public.create_public_booking(
       'c0000000-0000-4000-8000-000000000003',
       now() + interval '97 days',
       now() + interval '98 days',
       null,
       null,
       'carol@example.com',
       null,
       'Airport',
       'Airport',
       null,
       null,
       null,
       'Moalboal',
       2,
       '00000000-0000-4000-8000-000000000c03/license-selfie.jpg',
       '00000000-0000-4000-8000-000000000c03/government-id.jpg'
     ) $$,
  'P0001',
  'Your customer profile cannot book right now. Please contact support.',
  'blocked returning customer still cannot book'
);
reset role;

select * from finish(true);
rollback;
