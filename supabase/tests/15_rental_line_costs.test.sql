-- Migration 20261121090000: costs on delivery legs and booking fees, expenses
-- tagged to a rental from Finance, and list_rental_costs.
begin;
set local search_path = public, extensions;
select plan(18);

-- ---------------------------------------------------------------------------
-- Setup (as postgres): an online-style booking with a delivered pick-up,
-- an office return, and a car wash booking fee.
-- ---------------------------------------------------------------------------
insert into public.rentals (id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, status,
  pickup_method, return_method, pickup_delivery_fee, return_delivery_fee, booking_fees, booking_fees_total,
  quoted_daily_rate, quoted_days, quoted_total, booking_source)
values ('e0000000-0000-4000-8000-000000000050', 'WEB-COSTS', 'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000003', now() + interval '40 days', now() + interval '42 days', 'reserved',
  'within_city', 'office', 300, 0,
  jsonb_build_array(jsonb_build_object(
    'charge_type_id', (select id from public.rental_charge_types where code = 'car_wash'),
    'name', 'Car wash',
    'amount', 300
  )),
  300, 2500, 2, 5600, 'ops');

-- ---------------------------------------------------------------------------
-- Staff cannot record costs or read them
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select throws_ok(
  $$ select public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050', 'pickup', 250) $$,
  '42501', null, 'staff cannot record what a delivery cost'
);
select is(
  public.list_rental_costs('e0000000-0000-4000-8000-000000000050'),
  null,
  'staff cannot read a rental''s costs'
);

-- ---------------------------------------------------------------------------
-- Admin records the delivery and car wash costs from the bill
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select isnt(
  public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050', 'pickup', 250),
  null,
  'admin records what the delivery cost'
);
select isnt(
  public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050',
    'fee:' || (select id from public.rental_charge_types where code = 'car_wash'), 300),
  null,
  'admin records what the car wash cost'
);
select lives_ok(
  $$ select public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050', 'pickup', 200) $$,
  'changing a delivery cost'
);
select throws_ok(
  $$ select public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050', 'return', 200) $$,
  '22023', 'This rental has no collection fee on its bill.',
  'a leg with no fee on the bill takes no cost'
);
select throws_ok(
  $$ select public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050',
       'fee:' || (select id from public.rental_charge_types where code = 'delivery'), 200) $$,
  '22023', 'That fee is not on this rental''s bill.',
  'a fee not on the bill takes no cost'
);
select is(
  jsonb_array_length(public.list_rental_costs('e0000000-0000-4000-8000-000000000050') -> 'costs'),
  2,
  'admin reads both costs'
);
select is(
  (public.list_rental_costs('e0000000-0000-4000-8000-000000000050') ->> 'can_open_finance')::boolean,
  false,
  'admin cannot open Finance'
);

reset role;

-- ---------------------------------------------------------------------------
-- The expenses landed in the ledger, filed and tagged
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.expenses
   where rental_id = 'e0000000-0000-4000-8000-000000000050' and rental_line = 'pickup' and status = 'recorded'),
  1::bigint,
  'changing a cost edits its one expense'
);
select is(
  (select e.gross_amount from public.expenses e
   where e.rental_id = 'e0000000-0000-4000-8000-000000000050' and e.rental_line = 'pickup' and e.status = 'recorded'),
  200.00::numeric,
  'the delivery expense carries the new cost'
);
select is(
  (select c.code from public.expenses e join public.expense_categories c on c.id = e.category_id
   where e.rental_id = 'e0000000-0000-4000-8000-000000000050' and e.rental_line like 'fee:%'),
  'janitorial',
  'the car wash cost files under janitorial'
);
select is(
  (select e.vehicle_id from public.expenses e
   where e.rental_id = 'e0000000-0000-4000-8000-000000000050' and e.rental_line = 'pickup'),
  'c0000000-0000-4000-8000-000000000003'::uuid,
  'the cost is tagged to the rental''s car'
);

-- ---------------------------------------------------------------------------
-- Owner tags an expense to the rental from Finance
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
insert into public.expenses (expense_date, category_id, rental_id, description, document_type, gross_amount)
values (current_date, (select id from public.expense_categories where code = 'miscellaneous'),
  'e0000000-0000-4000-8000-000000000050', 'Parking at the airport', 'none', 150);

select is(
  (select vehicle_id from public.expenses where description = 'Parking at the airport'),
  'c0000000-0000-4000-8000-000000000003'::uuid,
  'an expense tagged to a rental gets the rental''s car'
);
select is(
  jsonb_array_length(public.list_rental_costs('e0000000-0000-4000-8000-000000000050') -> 'costs'),
  3,
  'the rental lists the cost tagged from Finance'
);
select throws_ok(
  $$ update public.expenses set rental_id = null
     where rental_id = 'e0000000-0000-4000-8000-000000000050' and rental_line = 'pickup' $$,
  '23514', null,
  'a cost entered on the bill cannot be untagged from Finance'
);
select is(
  (select summary from public.rental_expense_options where id = 'e0000000-0000-4000-8000-000000000050'),
  'Alice Renter · CCC 333 · ' || to_char((now() + interval '40 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY'),
  'the Rental picker names the customer, car and start date'
);

-- Clearing a cost voids its expense.
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select public.set_rental_line_cost('e0000000-0000-4000-8000-000000000050', 'pickup', 0);
reset role;
select is(
  (select count(*) from public.expenses
   where rental_id = 'e0000000-0000-4000-8000-000000000050' and rental_line = 'pickup' and status = 'recorded'),
  0::bigint,
  'a cleared cost voids its expense'
);

select * from finish(true);
rollback;
