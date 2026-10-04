-- Migration 20261005100000_vehicle_loans: owner-only loans, atomic payment +
-- Interest expense, voiding, payoff, and the per-vehicle overview.
--
-- Window W = 2026-03-01..2026-03-10 (Manila), as in 04_analytics.
-- V1 (AAA 111) in W, from 04_analytics: 2 rentals, 5 rented days, 7300 collected
-- (all payments non_vat before any VAT registration, so income = collected).
--
-- Loan L1 on V1: 600000 financed, 15000 x 48, first due 2026-01-15, 1 paid before.
--   installment 2 paid 03-05: principal 9000 + interest 6000 -> Interest expense 6000
-- Loan L2 on V2: 10000 financed, 10500 x 1 -> paid off by its only installment.
begin;
set local search_path = public, extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Admin: no books, but the operational overview
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';

select throws_ok(
  $$ insert into public.vehicle_loans (vehicle_id, lender_name, amount_financed, monthly_amortization, term_months, first_due_date)
     values ('c0000000-0000-4000-8000-000000000001', 'Sneaky Bank', 1000, 100, 12, '2026-01-01') $$,
  '42501', null, 'admin: loan insert denied by RLS');
select throws_ok(
  $$ select public.record_vehicle_loan_payment(gen_random_uuid(), 1, '2026-03-01', 1, 1) $$,
  '42501', null, 'admin: record payment denied');
select is(
  (public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') -> 'summary')
    - 'expenses',
  '{"window_days": 10, "rental_count": 2, "rented_days": 5, "collected": 7300.00, "income": 7300.00}'::jsonb,
  'admin: overview summary matches analytics for V1'
);
select ok(
  (public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') ->> 'finance_visible')::boolean
    is false
  and (public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') -> 'summary' -> 'expenses')
    = 'null'::jsonb,
  'admin: costs hidden from the overview'
);

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok(
  $$ select public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') $$,
  '42501', 'Vehicle analytics are available to owners and admins only.', 'customer: overview denied');
select is((select count(*) from public.vehicle_loans), 0::bigint, 'customer: loans hidden');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select throws_ok(
  $$ select public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') $$,
  '42501', null, 'staff: overview denied');

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';

select throws_ok(
  $$ select public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-10', '2026-03-01') $$,
  '22023', null, 'overview: reversed window rejected');

select throws_ok(
  $$ insert into public.vehicle_loans (vehicle_id, lender_name, amount_financed, monthly_amortization, term_months, first_due_date)
     values ('c0000000-0000-4000-8000-000000000001', 'Short Bank', 10000, 100, 12, '2026-01-01') $$,
  '23514', null, 'loan: amortization x term must cover the amount financed');

insert into public.vehicle_loans (
  id, vehicle_id, lender_name, amount_financed, monthly_amortization, term_months,
  first_due_date, installments_paid_before
)
values
  ('10a00000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'BDO Auto Loans', 600000, 15000, 48, '2026-01-15', 1),
  ('10a00000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'Quick Finance', 10000, 10500, 1, '2026-03-01', 0);

select throws_ok(
  $$ insert into public.vehicle_loans (vehicle_id, lender_name, amount_financed, monthly_amortization, term_months, first_due_date)
     values ('c0000000-0000-4000-8000-000000000001', 'Second Bank', 1000, 100, 12, '2026-01-01') $$,
  '23505', null, 'loan: one active loan per vehicle');

select throws_ok(
  $$ select public.record_vehicle_loan_payment('10a00000-0000-4000-8000-000000000001', 1, '2026-03-05', 9000, 6000) $$,
  '22023', 'That installment is not open on this loan.', 'payment: installment settled before tracking is closed');
select throws_ok(
  $$ select public.record_vehicle_loan_payment('10a00000-0000-4000-8000-000000000001', 49, '2026-03-05', 9000, 6000) $$,
  '22023', null, 'payment: installment past the term rejected');
select throws_ok(
  $$ select public.record_vehicle_loan_payment('10a00000-0000-4000-8000-000000000001', 2, '2026-03-05', 0, 0) $$,
  '22023', null, 'payment: zero payment rejected');

select isnt(
  public.record_vehicle_loan_payment(
    '10a00000-0000-4000-8000-000000000001', 2, '2026-03-05', 9000, 6000, 'bank', 'OR-123'),
  null,
  'payment: installment 2 recorded'
);
select results_eq(
  $$ select c.code, e.vehicle_id, e.gross_amount, e.net_amount, e.supplier_name,
            e.document_type, e.document_number, e.status
       from public.vehicle_loan_payments lp
       join public.expenses e on e.id = lp.expense_id
       join public.expense_categories c on c.id = e.category_id
      where lp.loan_id = '10a00000-0000-4000-8000-000000000001' $$,
  $$ values ('interest'::text, 'c0000000-0000-4000-8000-000000000001'::uuid, 6000.00::numeric,
             6000.00::numeric, 'BDO Auto Loans'::text, 'official_receipt'::text, 'OR-123'::text,
             'recorded'::text) $$,
  'payment: only the interest is posted, as a vehicle-tagged Interest expense'
);
select is(
  (select amount_paid from public.vehicle_loan_payments
    where loan_id = '10a00000-0000-4000-8000-000000000001' and status = 'recorded'),
  15000.00::numeric,
  'payment: amount paid is principal + interest'
);
select throws_ok(
  $$ select public.record_vehicle_loan_payment('10a00000-0000-4000-8000-000000000001', 2, '2026-03-06', 9000, 6000) $$,
  '23505', 'That installment is already recorded.', 'payment: an installment is recorded once');

-- Overview for the owner: costs, categories and activity
select is(
  (public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') -> 'summary' ->> 'expenses')::numeric,
  6000.00,
  'owner: overview costs include the posted interest'
);
select is(
  (select count(*) from jsonb_array_elements(
     public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') -> 'activity') a
    where a ->> 'kind' = 'loan_payment'),
  1::bigint,
  'owner: the loan payment shows in activity'
);
select is(
  (select count(*) from jsonb_array_elements(
     public.vehicle_overview('c0000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-10') -> 'activity') a
    where a ->> 'kind' = 'expense'),
  0::bigint,
  'owner: its interest expense is not listed twice'
);

-- Void undoes both rows
select lives_ok(
  $$ select public.void_vehicle_loan_payment(
       (select id from public.vehicle_loan_payments
         where loan_id = '10a00000-0000-4000-8000-000000000001' and status = 'recorded')) $$,
  'void: owner can void a payment'
);
select is(
  (select e.status from public.vehicle_loan_payments lp join public.expenses e on e.id = lp.expense_id
    where lp.loan_id = '10a00000-0000-4000-8000-000000000001'),
  'void',
  'void: the interest expense is voided with it'
);

-- Payoff
select isnt(
  public.record_vehicle_loan_payment('10a00000-0000-4000-8000-000000000002', 1, '2026-03-02', 10000, 500),
  null,
  'payoff: last installment recorded'
);
select is(
  (select status from public.vehicle_loans where id = '10a00000-0000-4000-8000-000000000002'),
  'paid_off',
  'payoff: loan marked paid off after its last installment'
);

select * from finish(true);
rollback;
