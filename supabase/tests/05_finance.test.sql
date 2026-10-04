-- Migration 20261005090000_financial_statements: owner-only gate, VAT stamping
-- on the payments ledger, derived EWT, register constraints, and hand-computed
-- statement figures over supabase/tests/_seed.sql.
--
-- Window W = 2026-03-01..2026-03-10 (Manila), as in 04_analytics.
--
-- Receipts in W before any VAT registration (all rows stamped non_vat):
--   positive: 5600 + 500 (R1) + 1800 + 4200 (R2) + 1200 (R3) + 2000 + 10 (R6)
--             + 900 (R4)                                   = 16210 gross
--   refunds:  300 (R2) + 900 (R4)                          = 1200
--   net 15010 (equals analytics "collected"); public_web R2: 1800+4200-300 = 5700;
--   ops 9310; penalties billed 500 (R1); 10 receipt rows (the penalty is not one).
--   per vehicle: V1 (R1,R3) 7300, V2 (R2,R4) 5700, V4 (R6) 2010.
--
-- After registering for VAT and re-stamping from 2026-03-05, 8 rows change
-- (f6 f7 f8 f9 f12 f13 f15 f17). VAT at 12/112, rounded per row:
--   f6 4200 -> 450.00, f7 refund 300 -> 32.14, f8 1200 -> 128.57,
--   f12 refund 900 -> 96.43, f17 10 -> 1.07
--   output VAT in W = 450.00 - 32.14 + 128.57 - 96.43 + 1.07 = 451.07
--   vatable in W = 4200 - 300 + 1200 - 900 + 10 = 4210; non_vat = 10800
--   net of VAT = 15010 - 451.07 = 14558.93
--
-- Expenses (inserted below as the owner):
--   E1 03-03 repairs_labor V1 1120 incl. 120 VAT, VAT invoice, 2% EWT not remitted
--      -> net 1000, ewt 20.00, creditable input 120, at risk 1000
--   E2 03-04 fuel_oil 500, no document -> at risk 500
--   E3 03-20 rental 10000 -> outside W
--   E4 03-05 rental 3000 incl. 100 VAT from a non-VAT supplier, no TIN, no EWT
--      -> net 2900, input VAT not creditable, EWT expected (rental hints 5%)
--   E5 03-06 miscellaneous 999, void -> excluded
-- Certificates: pending 100 (period_to 03-10), received 50 (period_to 03-05),
--   out-of-window 70 (period_to 03-31).
-- Exceptions in W: missing_document E2, withholding_not_remitted E1,
--   vehicle_without_cost V2 V3 V5 (V1 registered, V4 inactive),
--   input_vat_not_creditable E4, missing_supplier_tin E4, certificate_pending 1,
--   withholding_expected E4 -> 9
begin;
set local search_path = public, extensions;
select plan(40);

-- ---------------------------------------------------------------------------
-- Role gate: owner only
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok($$ select public.finance_statement('2026-03-01', '2026-03-10') $$,
  '42501', 'Financial statements are available to the owner only.', 'customer: statement denied');
select is((select count(*) from public.tax_settings), 0::bigint, 'customer: tax settings hidden');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select throws_ok($$ select public.finance_statement('2026-03-01', '2026-03-10') $$,
  '42501', null, 'staff: statement denied');

set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000002","role":"authenticated","email":"admin@zeke.test"}';
select throws_ok($$ select public.finance_statement('2026-03-01', '2026-03-10') $$,
  '42501', null, 'admin: statement denied (owner-only, tighter than analytics)');
select throws_ok($$ select public.finance_restamp_payment_vat('2026-01-01') $$,
  '42501', null, 'admin: restamp denied');
select is((select count(*) from public.expense_categories), 0::bigint, 'admin: categories hidden');
select throws_ok(
  $$ insert into public.expenses (expense_date, category_id, description, gross_amount)
     values ('2026-03-03', gen_random_uuid(), 'Sneaky', 100) $$,
  '42501', null, 'admin: expense insert denied by RLS');
select throws_ok(
  $$ insert into public.withholding_certificates (payor_name, period_from, period_to, income_payment, tax_withheld)
     values ('X', '2026-03-01', '2026-03-31', 100, 5) $$,
  '42501', null, 'admin: certificate insert denied by RLS');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.finance_statement('2026-03-01', '2026-03-10') $$,
  '42501', null, 'anon: no execute privilege');
reset role;

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';

select throws_ok($$ select public.finance_statement('2026-03-10', '2026-03-01') $$,
  '22023', null, 'p_to < p_from rejected');
select throws_ok($$ select public.finance_statement('2026-01-01', '2027-02-05') $$,
  '22023', null, 'window over 400 days rejected');

select is((select count(*) from public.tax_settings), 1::bigint, 'owner: one tax settings row');
select ok((select bool_and(vat_treatment = 'non_vat' and vat_amount = 0 and net_of_vat = amount)
             from public.payments),
  'backfill: existing payments stamped non_vat with no VAT');

-- Receipts before VAT registration
select is(
  (public.finance_statement('2026-03-01', '2026-03-10') -> 'receipts')
    - 'outstanding_balance',
  jsonb_build_object(
    'gross_collected', 16210.00, 'refunds', 1200.00, 'net_receipts', 15010.00,
    'vatable', 0, 'zero_rated', 0, 'exempt', 0, 'non_vat', 15010.00,
    'output_vat', 0.00, 'net_of_vat', 15010.00,
    'public_web', 5700.00, 'ops', 9310.00,
    'penalties_billed', 500.00, 'payment_count', 10
  ),
  'receipts: cash basis by confirmed_at, refunds netted, penalties excluded'
);
select is(
  (public.finance_statement('2026-03-01', '2026-03-10') -> 'receipts' ->> 'outstanding_balance')::numeric,
  5215.00,
  'receipts: outstanding balance matches analytics'
);
select is(
  (select jsonb_object_agg(v ->> 'plate_number', (v ->> 'receipts_net_of_vat')::numeric)
     from jsonb_array_elements(public.finance_statement('2026-03-01', '2026-03-10') -> 'vehicles') v),
  '{"AAA 111": 7300.00, "BBB 222": 5700.00, "CCC 333": 0, "DDD 444": 2010.00, "EEE 555": 0}'::jsonb,
  'vehicles: receipts per unit through the rental'
);

-- VAT registration + re-stamp
update public.tax_settings set vat_registered = true;
select is(public.finance_restamp_payment_vat('2026-03-05'), 8, 'restamp: rows from 03-05 re-stamped');
select results_eq(
  $$ select vat_treatment, vat_rate, vat_amount, net_of_vat from public.payments
      where id in ('f0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000005')
      order by id $$,
  $$ values ('non_vat'::text, null::numeric, 0.00::numeric, 1800.00::numeric),
            ('vatable'::text, 0.1200::numeric, 450.00::numeric, 3750.00::numeric) $$,
  'restamp: 03-05 balance is VAT-inclusive at 12/112; 03-01 deposit untouched'
);
select is(
  (public.finance_statement('2026-03-01', '2026-03-10') -> 'receipts')
    - 'outstanding_balance' - 'gross_collected' - 'refunds' - 'public_web' - 'ops'
    - 'penalties_billed' - 'payment_count',
  jsonb_build_object(
    'net_receipts', 15010.00, 'vatable', 4210.00, 'zero_rated', 0, 'exempt', 0,
    'non_vat', 10800.00, 'output_vat', 451.07, 'net_of_vat', 14558.93
  ),
  'receipts: VAT split per stamped row, refunds reverse their VAT'
);

-- New payments stamp from current settings; explicit treatment wins.
reset role;
insert into public.payments (id, rental_id, payment_type, amount, method, status, submitted_at, confirmed_at)
values ('f0000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000003',
        'balance', 1120, 'cash', 'confirmed', '2026-03-20 10:00+08', '2026-03-20 10:00+08');
insert into public.payments (id, rental_id, payment_type, amount, method, status, submitted_at, confirmed_at, vat_treatment)
values ('f0000000-0000-4000-8000-000000000102', 'e0000000-0000-4000-8000-000000000003',
        'balance', 500, 'cash', 'confirmed', '2026-03-20 10:00+08', '2026-03-20 10:00+08', 'exempt');
select results_eq(
  $$ select vat_treatment, vat_amount, net_of_vat from public.payments
      where id in ('f0000000-0000-4000-8000-000000000101', 'f0000000-0000-4000-8000-000000000102')
      order by id $$,
  $$ values ('vatable'::text, 120.00::numeric, 1000.00::numeric),
            ('exempt'::text, 0.00::numeric, 500.00::numeric) $$,
  'insert: stamped from settings; explicit exempt kept'
);
update public.payments set amount = 2240 where id = 'f0000000-0000-4000-8000-000000000101';
select is((select vat_amount from public.payments where id = 'f0000000-0000-4000-8000-000000000101'),
  240.00, 'update: amount change recomputes VAT');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000001","role":"authenticated","email":"owner@zeke.test"}';

-- Expenses
insert into public.expenses (
  id, expense_date, category_id, vehicle_id, description, supplier_name, supplier_tin,
  supplier_vat_registered, document_type, document_number, gross_amount, input_vat,
  withholding_required, ewt_percent, ewt_remitted, status
)
select v.id, v.expense_date, c.id, v.vehicle_id, v.description, v.supplier_name, v.supplier_tin,
       v.supplier_vat_registered, v.document_type, v.document_number, v.gross_amount, v.input_vat,
       v.withholding_required, v.ewt_percent, v.ewt_remitted, v.status
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, '2026-03-03'::date, 'repairs_labor',
   'c0000000-0000-4000-8000-000000000001'::uuid, 'PMS 10k', 'Cebu Auto', '123-456-789', true,
   'vat_invoice', 'SI-1', 1120::numeric, 120::numeric, true, 2::numeric, false, 'recorded'),
  ('a1000000-0000-4000-8000-000000000002', '2026-03-04', 'fuel_oil',
   null, 'Fuel, no receipt', null, null, false,
   'none', null, 500, 0, false, null, false, 'recorded'),
  ('a1000000-0000-4000-8000-000000000003', '2026-03-20', 'rental',
   null, 'Garage April', 'Landlord', '111-222-333', false,
   'non_vat_invoice', 'R-1', 10000, 0, true, 5, true, 'recorded'),
  ('a1000000-0000-4000-8000-000000000004', '2026-03-05', 'rental',
   null, 'Parking March', 'Lot Co', null, false,
   'vat_invoice', 'OR-9', 3000, 100, false, null, false, 'recorded'),
  ('a1000000-0000-4000-8000-000000000005', '2026-03-06', 'miscellaneous',
   null, 'Typo entry', null, null, false,
   'none', null, 999, 0, false, null, false, 'void')
) as v(id, expense_date, code, vehicle_id, description, supplier_name, supplier_tin,
       supplier_vat_registered, document_type, document_number, gross_amount, input_vat,
       withholding_required, ewt_percent, ewt_remitted, status)
join public.expense_categories c on c.code = v.code;

select results_eq(
  $$ select net_amount, ewt_amount from public.expenses
      where id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004')
      order by id $$,
  $$ values (1000.00::numeric, 20.00::numeric), (2900.00::numeric, 0.00::numeric) $$,
  'expenses: net of VAT generated, EWT derived on the net amount'
);
update public.expenses set withholding_required = false
  where id = 'a1000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select ewt_percent, ewt_amount, ewt_remitted from public.expenses
      where id = 'a1000000-0000-4000-8000-000000000003' $$,
  $$ values (null::numeric, 0.00::numeric, false) $$,
  'expenses: turning withholding off clears the EWT fields'
);
update public.expenses set withholding_required = true, ewt_percent = 5, ewt_remitted = true
  where id = 'a1000000-0000-4000-8000-000000000003';
select throws_ok($$ delete from public.expenses where id = 'a1000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'expenses: never deleted (void instead)');
select throws_ok(
  $$ insert into public.expenses (expense_date, category_id, description, gross_amount, input_vat)
     select '2026-03-03', id, 'Bad VAT', 100, 100 from public.expense_categories where code = 'fuel_oil' $$,
  '23514', null, 'expenses: input VAT must be below the gross amount');
select is((select count(*) from public.expense_ledger where category_name is not null), 5::bigint,
  'expense_ledger view: owner reads labelled rows');

-- Fixed assets
insert into public.fixed_assets (vehicle_id, name, acquisition_date, acquisition_cost, salvage_value, useful_life_months)
values ('c0000000-0000-4000-8000-000000000001', 'Toyota Vios AAA 111', '2025-01-15', 900000, 100000, 60);
select throws_ok(
  $$ insert into public.fixed_assets (vehicle_id, name, acquisition_date, acquisition_cost, useful_life_months)
     values ('c0000000-0000-4000-8000-000000000001', 'Duplicate', '2025-01-15', 500000, 60) $$,
  '23505', null, 'fixed assets: one register row per vehicle');
select throws_ok(
  $$ insert into public.fixed_assets (name, acquisition_date, acquisition_cost, useful_life_months, depreciation_method)
     values ('Odd life', '2025-01-15', 500000, 30, 'sum_of_years_digits') $$,
  '23514', null, 'fixed assets: accelerated methods need whole years');
select throws_ok(
  $$ insert into public.fixed_assets (name, acquisition_date, acquisition_cost, salvage_value)
     values ('Bad salvage', '2025-01-15', 500000, 500000) $$,
  '23514', null, 'fixed assets: salvage below cost');
select is((select status from public.fixed_asset_register where vehicle_id = 'c0000000-0000-4000-8000-000000000001'),
  'active', 'fixed_asset_register view: status derived from disposal');

-- 2307 certificates
insert into public.withholding_certificates (payor_name, period_from, period_to, income_payment, tax_withheld, status, received_on)
values
  ('Acme Corp', '2026-03-01', '2026-03-10', 2000, 100, 'pending', null),
  ('Beta Inc', '2026-03-01', '2026-03-05', 1000, 50, 'received', '2026-03-09'),
  ('Later Ltd', '2026-03-01', '2026-03-31', 1400, 70, 'received', '2026-04-02');
select throws_ok(
  $$ insert into public.withholding_certificates (payor_name, period_from, period_to, income_payment, tax_withheld, status)
     values ('No date', '2026-03-01', '2026-03-31', 1000, 50, 'received') $$,
  '23514', null, 'certificates: received requires a received date');

-- Statement: expenses, withholding, exceptions
select is(
  (select jsonb_object_agg(e ->> 'code', jsonb_build_object(
      'net', (e ->> 'net')::numeric, 'creditable_input_vat', (e ->> 'creditable_input_vat')::numeric,
      'ewt', (e ->> 'ewt')::numeric, 'at_risk', (e ->> 'at_risk')::numeric, 'entries', (e ->> 'entries')::int))
     from jsonb_array_elements(public.finance_statement('2026-03-01', '2026-03-10') -> 'expenses') e
    where (e ->> 'entries')::int > 0),
  '{"repairs_labor": {"net": 1000.00, "creditable_input_vat": 120.00, "ewt": 20.00, "at_risk": 1000.00, "entries": 1},
    "fuel_oil": {"net": 500.00, "creditable_input_vat": 0, "ewt": 0, "at_risk": 500.00, "entries": 1},
    "rental": {"net": 2900.00, "creditable_input_vat": 0, "ewt": 0.00, "at_risk": 0, "entries": 1}}'::jsonb,
  'expenses: per BIR line, void and out-of-window rows excluded'
);
select is(
  jsonb_array_length(public.finance_statement('2026-03-01', '2026-03-10') -> 'expenses'),
  (select count(*)::int from public.expense_categories where is_active),
  'expenses: every active BIR line listed, even at zero'
);
select is(
  public.finance_statement('2026-03-01', '2026-03-10') -> 'withholding',
  jsonb_build_object(
    'cwt_withheld', 150.00, 'cwt_received', 50.00, 'cwt_pending', 100.00,
    'cwt_income_payments', 3000.00, 'ewt_withheld', 20.00, 'ewt_unremitted', 20.00
  ),
  'withholding: 2307s by covered period, EWT owed by expense date'
);
select is(
  (select (v ->> 'expenses_net')::numeric
     from jsonb_array_elements(public.finance_statement('2026-03-01', '2026-03-10') -> 'vehicles') v
    where v ->> 'plate_number' = 'AAA 111'),
  1000.00,
  'vehicles: tagged expenses per unit'
);
select is(
  (select jsonb_object_agg(kind, n) from (
     select x ->> 'kind' as kind, count(*) as n
     from jsonb_array_elements(public.finance_statement('2026-03-01', '2026-03-10') -> 'exceptions') x
     group by 1) s),
  '{"missing_document": 1, "withholding_not_remitted": 1, "vehicle_without_cost": 3,
    "input_vat_not_creditable": 1, "missing_supplier_tin": 1, "certificate_pending": 1,
    "withholding_expected": 1}'::jsonb,
  'exceptions: every guardrail fires exactly where expected'
);
select is(
  (public.finance_statement('2026-03-01', '2026-03-10') -> 'exceptions' -> 0 ->> 'severity'),
  'high',
  'exceptions: highest severity first'
);
select is(
  (public.finance_statement('2026-03-01', '2026-03-10') -> 'monthly'),
  jsonb_build_array(jsonb_build_object(
    'month', '2026-03', 'net_receipts', 15010.00, 'output_vat', 451.07,
    'expenses_net', 4400.00, 'creditable_input_vat', 120.00, 'ewt', 20.00
  )),
  'monthly: one row per month, clipped to the window'
);
select is(
  jsonb_array_length(public.finance_statement('2026-02-15', '2026-04-15') -> 'monthly'),
  3,
  'monthly: partial months at both ends included'
);

reset role;
select ok(
  (select bool_and(not p.prosecdef)
     from pg_proc p
    where p.oid in (
      'public.finance_statement(date, date)'::regprocedure,
      'public.finance_restamp_payment_vat(date)'::regprocedure
    )),
  'finance RPCs are SECURITY INVOKER'
);

select * from finish(true);
rollback;
