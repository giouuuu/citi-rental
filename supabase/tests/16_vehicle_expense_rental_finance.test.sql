-- Migration 20261122090000: a vehicle expense tagged to a rental lands in
-- Finance, filed under its category's BIR line, and stays in step.
begin;
set local search_path = public, extensions;
select plan(14);

-- R3: Dan, V1 (AAA 111), active. Staff record a car wash for it.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';

select throws_ok(
  $$ insert into public.vehicle_expenses (vehicle_id, category_id, amount, incurred_on, rental_id)
     values ('c0000000-0000-4000-8000-000000000002',
       (select id from public.vehicle_expense_categories where name = 'Car wash'),
       300, current_date, 'e0000000-0000-4000-8000-000000000003') $$,
  '23514', 'That rental was on AAA 111. Pick that car, or leave Vehicle blank.',
  'a rental on another car is refused'
);

insert into public.vehicle_expenses (id, category_id, amount, incurred_on, vendor, reference, rental_id)
values ('f0000000-0000-4000-8000-000000000001',
  (select id from public.vehicle_expense_categories where name = 'Car wash'),
  300, current_date, 'Jun-Jun Wash', 'AR-1', 'e0000000-0000-4000-8000-000000000003');

select is(
  (select vehicle_id from public.vehicle_expenses where id = 'f0000000-0000-4000-8000-000000000001'),
  'c0000000-0000-4000-8000-000000000001'::uuid,
  'a blank vehicle takes the rental''s car'
);
select is(
  (select count(*) from public.expenses),
  0::bigint,
  'staff still cannot read Finance'
);

reset role;

select is(
  (select gross_amount from public.expenses where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  300.00::numeric,
  'the car wash lands in Finance'
);
select is(
  (select c.code from public.expenses e join public.expense_categories c on c.id = e.category_id
   where e.vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  'janitorial',
  'it files under the car wash category''s BIR line'
);
select is(
  (select description || ' / ' || supplier_name || ' / ' || document_number from public.expenses
   where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  'Car wash · OPS-003 / Jun-Jun Wash / AR-1',
  'it names the rental, vendor and OR number'
);
select is(
  (select count(*) from public.expenses e
   join public.vehicle_expense_categories v on v.expense_category_id = e.category_id
   where v.name = 'Delivery'),
  0::bigint,
  'nothing yet under Delivery'
);
select is(
  (select c.code from public.vehicle_expense_categories v join public.expense_categories c on c.id = v.expense_category_id
   where v.name = 'Delivery'),
  'transportation_travel',
  'a Delivery category files under transportation'
);

-- Staff fix the amount: Finance follows.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
update public.vehicle_expenses set amount = 250 where id = 'f0000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select gross_amount from public.expenses where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  250.00::numeric,
  'editing the vehicle expense updates Finance'
);

-- The owner cannot move it to another rental from Finance.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';
select throws_ok(
  $$ update public.expenses set rental_id = 'e0000000-0000-4000-8000-000000000001'
     where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23514', 'This cost comes from Expenses. Change its rental there.',
  'Finance cannot move a vehicle expense''s rental'
);
select is(
  (public.list_rental_costs('e0000000-0000-4000-8000-000000000003') -> 'costs' -> 0 ->> 'vehicle_expense_id'),
  'f0000000-0000-4000-8000-000000000001',
  'the rental lists it with its vehicle expense'
);

-- Untagging voids it; tagging again counts it again.
update public.vehicle_expenses set rental_id = null where id = 'f0000000-0000-4000-8000-000000000001';
select is(
  (select status from public.expenses where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  'void',
  'untagging the rental voids the Finance row'
);
update public.vehicle_expenses set rental_id = 'e0000000-0000-4000-8000-000000000003'
where id = 'f0000000-0000-4000-8000-000000000001';
select is(
  (select status from public.expenses where vehicle_expense_id = 'f0000000-0000-4000-8000-000000000001'),
  'recorded',
  'tagging it again records it again'
);

delete from public.vehicle_expenses where id = 'f0000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*) from public.expenses where description = 'Car wash · OPS-003' and status = 'void'),
  1::bigint,
  'deleting the vehicle expense voids its Finance row'
);

select * from finish(true);
rollback;
