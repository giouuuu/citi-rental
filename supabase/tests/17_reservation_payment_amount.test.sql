-- Migration 20261124090000: at the reservation step the renter says how much
-- they sent, from the reservation fee up to the whole trip.
begin;
set local search_path = public, extensions;
select plan(9);

insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status,
  quoted_daily_rate, quoted_days, quoted_total, deposit_amount, booking_source)
values
  ('e0000000-0000-4000-8000-000000000070', 'WEB-FULL', 'd0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000003', now() + interval '60 days', now() + interval '61 days', 'draft',
   2500, 1, 2500, 1000, 'public_web'),
  ('e0000000-0000-4000-8000-000000000071', 'WEB-FEE', 'd0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000003', now() + interval '70 days', now() + interval '71 days', 'draft',
   2500, 1, 2500, 1000, 'public_web');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';

select throws_ok(
  $$ select public.submit_booking_payment_proof('e0000000-0000-4000-8000-000000000070', 'WEB-FULL',
       'GCASH-123456', 'e0000000-0000-4000-8000-000000000070/proof.jpg', 500) $$,
  '22023', 'Send at least the ₱1,000.00 reservation fee.',
  'less than the reservation fee is refused'
);
select throws_ok(
  $$ select public.submit_booking_payment_proof('e0000000-0000-4000-8000-000000000070', 'WEB-FULL',
       'GCASH-123456', 'e0000000-0000-4000-8000-000000000070/proof.jpg', 3000) $$,
  '22023', 'You can pay up to ₱2,500.00 on this booking.',
  'more than the trip is refused'
);
select lives_ok(
  $$ select public.submit_booking_payment_proof('e0000000-0000-4000-8000-000000000070', 'WEB-FULL',
       'GCASH-123456', 'e0000000-0000-4000-8000-000000000070/proof.jpg', 2500) $$,
  'the renter sends the whole trip at the reservation step'
);
-- An older pay page sends no amount: the fee, as before.
select lives_ok(
  $$ select public.submit_booking_payment_proof('e0000000-0000-4000-8000-000000000071', 'WEB-FEE',
       'GCASH-654321', 'e0000000-0000-4000-8000-000000000071/proof.jpg') $$,
  'no amount means the reservation fee'
);
reset role;

select is(
  (select amount from public.payments where rental_id = 'e0000000-0000-4000-8000-000000000070' and status = 'submitted'),
  2500.00::numeric,
  'the payment records what the renter sent'
);
select is(
  (select amount from public.payments where rental_id = 'e0000000-0000-4000-8000-000000000071' and status = 'submitted'),
  1000.00::numeric,
  'a fee-only payment records the fee'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select public.confirm_rental_deposit('e0000000-0000-4000-8000-000000000070');
select public.confirm_rental_deposit('e0000000-0000-4000-8000-000000000071');
reset role;

select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000070'),
  0.00::numeric,
  'a full payment leaves nothing to pay'
);
select is(
  (select payment_status::text from public.rentals where id = 'e0000000-0000-4000-8000-000000000070'),
  'paid_in_full',
  'a full payment reads paid in full'
);
select is(
  (select balance_due from public.rentals where id = 'e0000000-0000-4000-8000-000000000071'),
  1500.00::numeric,
  'a fee-only payment leaves the rest'
);

select * from finish(true);
rollback;
