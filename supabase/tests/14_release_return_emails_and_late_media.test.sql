-- Migrations 20261027090000 + 20261027100000: photos and videos attached to
-- an inspection after it was submitted (until the rental is completed), and
-- the release / return emails queued with the documents for their PDF.
begin;
set local search_path = public, extensions;
select plan(17);

-- R5: Dan (dan@example.com), V2 BBB 222, reserved.
-- Inspections are written directly so the test exercises the trigger and the
-- claim, not submit_rental_inspection's own gates.
insert into public.rental_inspections (
  id, rental_id, inspection_type, odometer, fuel_level, customer_signature_path,
  customer_acknowledged_at
)
values (
  'f1000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000005', 'pickup', 18250, 100,
  'e0000000-0000-4000-8000-000000000005/signature-a.png', now()
);
insert into public.rental_inspection_items (inspection_id, area_code, label, item_group, status, notes)
values
  ('f1000000-0000-4000-8000-000000000001', 'rear_bumper', 'Rear bumper', 'exterior', 'scratch', 'Old scuff'),
  ('f1000000-0000-4000-8000-000000000001', 'front_bumper', 'Front bumper', 'exterior', 'ok', null);
insert into public.rental_inspection_photos (inspection_id, storage_path, kind)
values
  ('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005/other-1.jpg', 'other'),
  ('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005/other-2.jpg', 'other'),
  ('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005/signature-a.png', 'signature');

-- ---------------------------------------------------------------------------
-- Release email
-- ---------------------------------------------------------------------------
select is(
  (select status from public.rental_notifications
    where rental_id = 'e0000000-0000-4000-8000-000000000005' and kind = 'rental_released'),
  'pending',
  'a pickup inspection queues the release email'
);

create temp table _claim (k text primary key, res jsonb) on commit drop;
insert into _claim
select 'released', public.claim_rental_notification(
  (select id from public.rental_notifications
    where rental_id = 'e0000000-0000-4000-8000-000000000005' and kind = 'rental_released')
);

select is((select res ->> 'claimed' from _claim where k = 'released'), 'true', 'the release email is claimed');
select is((select res ->> 'recipient' from _claim where k = 'released'), 'dan@example.com', 'it goes to the customer');
select is((select res ->> 'plateNumber' from _claim where k = 'released'), 'BBB 222', 'the plate is included');
select is(
  (select jsonb_array_length(res -> 'documents' -> 'inspections') from _claim where k = 'released'),
  1,
  'the release documents hold the pickup inspection'
);
select is(
  (select res -> 'documents' -> 'inspections' -> 0 ->> 'mediaCount' from _claim where k = 'released'),
  '2',
  'the media count leaves out the signature'
);
select is(
  (select jsonb_array_length(res -> 'documents' -> 'inspections' -> 0 -> 'items') from _claim where k = 'released'),
  2,
  'the checklist items are included'
);
select ok(
  (select res -> 'documents' -> 'agreement' = 'null'::jsonb from _claim where k = 'released'),
  'no agreement is sent when the car was released without one'
);

-- ---------------------------------------------------------------------------
-- Late photos and videos
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok(
  $$ select public.add_rental_inspection_media('f1000000-0000-4000-8000-000000000001',
       '[{"storage_path":"e0000000-0000-4000-8000-000000000005/other-3.mp4"}]') $$,
  '42501', null, 'a customer cannot add inspection media'
);

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select is(
  public.add_rental_inspection_media('f1000000-0000-4000-8000-000000000001',
    '[{"storage_path":"e0000000-0000-4000-8000-000000000005/other-3.mp4"}]'),
  1,
  'admin adds a video to a submitted inspection'
);
select throws_ok(
  $$ select public.add_rental_inspection_media('f1000000-0000-4000-8000-000000000001',
       '[{"storage_path":"e0000000-0000-4000-8000-000000000001/other-9.jpg"}]') $$,
  '23514', 'A photo or video path is invalid.', 'files from another rental are refused'
);
select throws_ok(
  $$ select public.add_rental_inspection_media('f1000000-0000-4000-8000-000000000001',
       '[{"storage_path":"e0000000-0000-4000-8000-000000000005/notes.pdf"}]') $$,
  '23514', 'A photo or video path is invalid.', 'non-media files are refused'
);
reset role;

select is(
  (select added_late::text || '|' || added_by::text from public.rental_inspection_photos
    where storage_path = 'e0000000-0000-4000-8000-000000000005/other-3.mp4'),
  'true|0000000a-0000-4000-8000-000000000002',
  'the late file is marked with who added it'
);

-- ---------------------------------------------------------------------------
-- Return email, and late media closes with the rental
-- ---------------------------------------------------------------------------
insert into public.rental_inspections (
  id, rental_id, inspection_type, odometer, fuel_level, damage_charge_amount
)
values (
  'f1000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000005', 'return', 18612, 75, 4500
);
update public.rentals set status = 'active'
where id = 'e0000000-0000-4000-8000-000000000005';
update public.rentals set status = 'completed', actual_return_at = expected_return_at
where id = 'e0000000-0000-4000-8000-000000000005';

insert into _claim
select 'completed', public.claim_rental_notification(
  (select id from public.rental_notifications
    where rental_id = 'e0000000-0000-4000-8000-000000000005' and kind = 'rental_completed')
);
select is(
  (select res ->> 'claimed' from _claim where k = 'completed'),
  'true',
  'a return inspection queues and claims the return email'
);
select is(
  (select string_agg(i ->> 'type', ',' order by i ->> 'inspectedAt')
     from _claim, jsonb_array_elements(res -> 'documents' -> 'inspections') i
    where k = 'completed'),
  'pickup,return',
  'the return documents hold pickup and return, to compare'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select throws_ok(
  $$ select public.add_rental_inspection_media('f1000000-0000-4000-8000-000000000001',
       '[{"storage_path":"e0000000-0000-4000-8000-000000000005/other-4.jpg"}]') $$,
  '23514', 'Photos and videos can only be added until the rental is completed.',
  'late media is closed once the rental is completed'
);
reset role;

select throws_ok(
  $$ insert into public.rental_notifications (rental_id, kind)
     values ('e0000000-0000-4000-8000-000000000005', 'invoice') $$,
  '23514', null, 'unknown email kinds are refused'
);

select * from finish(true);
rollback;
