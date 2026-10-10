-- Migration 20261024090000: readable car slugs that follow the car, with old
-- slugs kept for redirects.
begin;
set local search_path = public, extensions;
select plan(13);

-- ---------------------------------------------------------------------------
-- Base words: make + name, the make dropped when it is a placeholder or
-- already in the name
-- ---------------------------------------------------------------------------
select is(private.vehicle_slug_base('Vios One', 'Toyota'), 'toyota-vios-one', 'make leads the name');
select is(private.vehicle_slug_base('Avanza Automatic', 'NA'), 'avanza-automatic', 'a placeholder make is left out');
select is(private.vehicle_slug_base('Toyota Vios', 'Toyota'), 'toyota-vios', 'a make already in the name is not repeated');
select is(private.vehicle_slug_base('  Vios  1.3 E/AT ', ''), 'vios-1-3-e-at', 'punctuation and spaces become single hyphens');

select is(
  (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-000000000001'),
  'toyota-vios-one',
  'seeded cars get a slug on insert'
);

-- ---------------------------------------------------------------------------
-- Two cars with the same name are told apart by colour
-- ---------------------------------------------------------------------------
insert into public.vehicles (id, plate_number, name, make, model, year, category, status, daily_rate, color)
values
  ('c0000000-0000-4000-8000-0000000000a1', 'SLG 001', 'Vios Automatic', 'NA', 'NA', 2026, 'Sedan', 'available', 1500, 'Blue'),
  ('c0000000-0000-4000-8000-0000000000a2', 'SLG 002', 'Vios Automatic', 'NA', 'NA', 2027, 'Sedan', 'available', 1500, 'Red');

select is(
  (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-0000000000a1'),
  'vios-automatic', 'the first car keeps the plain slug'
);
select is(
  (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-0000000000a2'),
  'vios-automatic-red', 'the second car is told apart by colour'
);

-- ---------------------------------------------------------------------------
-- The slug follows the car; the old one redirects
-- ---------------------------------------------------------------------------
update public.vehicles set color = 'Maroon'
where id = 'c0000000-0000-4000-8000-0000000000a2';
select is(
  (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-0000000000a2'),
  'vios-automatic-red', 'an unrelated edit keeps the slug'
);

update public.vehicles set make = 'Toyota'
where id = 'c0000000-0000-4000-8000-0000000000a1';
select is(
  (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-0000000000a1'),
  'toyota-vios-automatic', 'filling in the make moves the slug'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select slug from public.resolve_public_vehicle_slug('vios-automatic')),
  'toyota-vios-automatic', 'the old slug resolves to the current one'
);
select is(
  (select vehicle_id from public.resolve_public_vehicle_slug('toyota-vios-automatic')),
  'c0000000-0000-4000-8000-0000000000a1'::uuid, 'the current slug resolves to its car'
);
select is(
  (select count(*)::integer from public.resolve_public_vehicle_slug(
    (select slug from public.vehicles where id = 'c0000000-0000-4000-8000-000000000004'))),
  0, 'an inactive car does not resolve'
);
reset role;

select throws_ok(
  $$ insert into public.vehicle_slug_redirects (slug, vehicle_id)
     values ('Bad Slug', 'c0000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'a malformed slug is refused'
);

select * from finish(true);
rollback;
