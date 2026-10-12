-- Migration 20261125090000: turnaround gap between rentals, and a car back on
-- the pick-up day still listed as free for those dates.
begin;
set local search_path = public, extensions;
select plan(11);

-- CCC 333 is out Mar 10 9:00 AM → back Mar 18 7:00 AM (Manila).
insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status,
  quoted_total, booking_source)
values ('e0000000-0000-4000-8000-000000000080', 'OPS-TURN-1', 'd0000000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-000000000003', '2027-03-10 09:00+08', '2027-03-18 07:00+08', 'reserved', 10000, 'ops');

select is(
  (select turnaround_minutes from public.company_profile limit 1),
  90,
  'the turnaround starts at 1 h 30 min'
);

select throws_ok(
  $$ insert into public.rentals (reference_number, customer_id, vehicle_id, start_at, expected_return_at, status, booking_source)
     values ('OPS-TURN-2', 'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003',
       '2027-03-18 08:00+08', '2027-03-19 09:00+08', 'reserved', 'ops') $$,
  '23P01', null,
  'a trip an hour after the return is refused'
);
select lives_ok(
  $$ insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status, booking_source)
     values ('e0000000-0000-4000-8000-000000000081', 'OPS-TURN-3', 'd0000000-0000-4000-8000-000000000004',
       'c0000000-0000-4000-8000-000000000003', '2027-03-18 08:30+08', '2027-03-19 09:00+08', 'reserved', 'ops') $$,
  'a trip 1 h 30 min after the return is fine'
);
select throws_ok(
  $$ insert into public.rentals (reference_number, customer_id, vehicle_id, start_at, expected_return_at, status, booking_source)
     values ('OPS-TURN-4', 'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003',
       '2027-03-08 09:00+08', '2027-03-10 08:00+08', 'reserved', 'ops') $$,
  '23P01', null,
  'a trip ending an hour before the next pick-up is refused'
);

-- Bookings placed back to back before the gap existed stay workable.
update public.company_profile set turnaround_minutes = 0;
insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status, booking_source)
values ('e0000000-0000-4000-8000-000000000082', 'OPS-TURN-5', 'd0000000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-000000000003', '2027-03-19 09:00+08', '2027-03-20 09:00+08', 'reserved', 'ops');
update public.company_profile set turnaround_minutes = 90;
select lives_ok(
  $$ update public.rentals set status = 'overdue' where id = 'e0000000-0000-4000-8000-000000000082' $$,
  'a status change on a booking already placed is not judged by the gap'
);
select throws_ok(
  $$ update public.rentals set expected_return_at = '2027-03-20 10:00+08' where id = 'e0000000-0000-4000-8000-000000000081' $$,
  '23P01', null,
  'moving a booking is judged by the gap'
);

-- The calendar gets the taken times, widened by the gap.
set local role anon;
select is(
  (select min(start_at) from public.list_public_vehicle_booked_ranges('c0000000-0000-4000-8000-000000000003')
   where start_at >= '2027-01-01'),
  '2027-03-10 07:30+08'::timestamptz,
  'the calendar sees the car taken from 1 h 30 min before pick-up'
);
select is(
  (select max(expected_return_at) from public.list_public_vehicle_booked_ranges('c0000000-0000-4000-8000-000000000003')
   where start_at < '2027-03-15'),
  '2027-03-18 08:30+08'::timestamptz,
  'and until 1 h 30 min after the return'
);

-- "Free for these dates": back the morning of pick-up still lists it.
reset role;
delete from public.rentals where id in ('e0000000-0000-4000-8000-000000000081', 'e0000000-0000-4000-8000-000000000082');
set local role anon;
select ok(
  exists (select 1 from public.list_public_available_vehicles('2027-03-18', '2027-03-20')
          where id = 'c0000000-0000-4000-8000-000000000003'),
  'a car back the morning of the pick-up day is listed'
);
select ok(
  not exists (select 1 from public.list_public_available_vehicles('2027-03-15', '2027-03-20')
              where id = 'c0000000-0000-4000-8000-000000000003'),
  'a car out for a whole day of the trip is not'
);
select ok(
  exists (select 1 from public.list_public_available_vehicles('2027-03-05', '2027-03-10')
          where id = 'c0000000-0000-4000-8000-000000000003'),
  'a car going out the afternoon of the return day is listed'
);

select * from finish(true);
rollback;
