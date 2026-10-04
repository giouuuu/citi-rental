-- ===========================================================================
-- Financial statements (FINANCIAL_STATEMENT_PLAN.md, build steps 1-7).
--
-- Owner-only books: tax settings, VAT decomposition on the payments ledger,
-- an expense ledger mapped to BIR itemized-deduction lines, a fixed-asset
-- register, 2307 certificates received from clients, and one statement RPC.
--
-- Deliberate deviation from the plan: there is no `depreciation_entries`
-- table. Depreciation is a pure function of the register row (cost, salvage,
-- life, method, dates), so the app computes the schedule on read
-- (src/features/finance/lib/depreciation.ts). Stored entries would go stale
-- the moment an acquisition cost is corrected.
--
-- NOT TAX ADVICE. Every rate below lives in tax_settings so the accountant can
-- correct it without a migration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Owner gate. The books are the whole company's finances, so this is
--    tighter than the owner/admin gate on /analytics. Widen it here, in one
--    place, if an admin should keep the books.
-- ---------------------------------------------------------------------------
create or replace function private.is_finance_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role = 'owner'
  )
$$;

revoke all on function private.is_finance_user() from public, anon;
grant execute on function private.is_finance_user() to authenticated, service_role;

comment on function private.is_finance_user() is
  'True when the caller may read and write the books (active owner). Never null.';

-- ---------------------------------------------------------------------------
-- 1. tax_settings: one row of registration facts and rates.
-- ---------------------------------------------------------------------------
create table public.tax_settings (
  id uuid primary key default gen_random_uuid(),
  registered_name text check (registered_name is null or char_length(trim(registered_name)) between 1 and 200),
  tin text check (tin is null or tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  rdo_code text check (rdo_code is null or char_length(trim(rdo_code)) between 1 and 10),
  registered_address text check (registered_address is null or char_length(registered_address) <= 500),
  entity_type text not null default 'sole_proprietor'
    check (entity_type in ('sole_proprietor', 'partnership', 'corporation')),
  vat_registered boolean not null default false,
  -- Rates are fractions: 0.12 is 12%.
  vat_rate numeric(6, 4) not null default 0.12 check (vat_rate >= 0 and vat_rate < 1),
  percentage_tax_rate numeric(6, 4) not null default 0.03
    check (percentage_tax_rate >= 0 and percentage_tax_rate < 1),
  -- null = not elected yet; the worksheet still compares all options.
  income_tax_election text
    check (income_tax_election in ('eight_percent', 'graduated_osd', 'graduated_itemized')),
  eight_percent_rate numeric(6, 4) not null default 0.08
    check (eight_percent_rate >= 0 and eight_percent_rate < 1),
  eight_percent_exemption numeric(14, 2) not null default 250000 check (eight_percent_exemption >= 0),
  osd_rate numeric(6, 4) not null default 0.40 check (osd_rate >= 0 and osd_rate < 1),
  vat_threshold numeric(14, 2) not null default 3000000 check (vat_threshold > 0),
  corporate_income_tax_rate numeric(6, 4) not null default 0.25
    check (corporate_income_tax_rate >= 0 and corporate_income_tax_rate < 1),
  -- Annual graduated schedule for individuals (TRAIN, 2023 onward):
  -- tax = base + rate * (taxable - over), using the highest `over` <= taxable.
  graduated_brackets jsonb not null default '[
    {"over": 0, "base": 0, "rate": 0},
    {"over": 250000, "base": 0, "rate": 0.15},
    {"over": 400000, "base": 22500, "rate": 0.20},
    {"over": 800000, "base": 102500, "rate": 0.25},
    {"over": 2000000, "base": 402500, "rate": 0.30},
    {"over": 8000000, "base": 2202500, "rate": 0.35}
  ]'::jsonb check (jsonb_typeof(graduated_brackets) = 'array'),
  fiscal_year_start_month smallint not null default 1
    check (fiscal_year_start_month between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create unique index tax_settings_singleton on public.tax_settings ((true));

insert into public.tax_settings default values;

create trigger tax_settings_set_updated_at
before update on public.tax_settings
for each row execute function private.set_updated_at();

alter table public.tax_settings enable row level security;

revoke all on table public.tax_settings from anon, authenticated;
grant select, update on table public.tax_settings to authenticated;
grant all on table public.tax_settings to service_role;

create policy tax_settings_select_owner
on public.tax_settings for select to authenticated
using ((select private.is_finance_user()));

create policy tax_settings_update_owner
on public.tax_settings for update to authenticated
using ((select private.is_finance_user()))
with check ((select private.is_finance_user()));

comment on table public.tax_settings is
  'BIR registration facts and rates. Exactly one row (tax_settings_singleton). Rates are fractions.';

-- ---------------------------------------------------------------------------
-- 2. VAT decomposition on the payments ledger.
--
--    Stamped when the row is written, from the tax_settings in force then, so
--    registering for VAT later does not rewrite history. Re-stamping a range
--    is an explicit owner action (finance_restamp_payment_vat below).
--    Gross receipts for VAT / percentage tax are cash-basis (NIRC s.108):
--    the same confirmed_at dating analytics already uses.
-- ---------------------------------------------------------------------------
alter table public.payments
  add column vat_treatment text
    check (vat_treatment in ('vatable', 'zero_rated', 'exempt', 'non_vat')),
  add column vat_rate numeric(6, 4) check (vat_rate is null or (vat_rate >= 0 and vat_rate < 1)),
  add column vat_amount numeric(12, 2),
  add column net_of_vat numeric(12, 2);

create or replace function private.payments_apply_vat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered boolean;
  v_rate numeric;
begin
  select ts.vat_registered, ts.vat_rate
  into v_registered, v_rate
  from public.tax_settings ts
  limit 1;

  if new.vat_treatment is null then
    new.vat_treatment := case when coalesce(v_registered, false) then 'vatable' else 'non_vat' end;
    new.vat_rate := null;
  end if;

  if new.vat_treatment = 'vatable' then
    new.vat_rate := coalesce(new.vat_rate, v_rate, 0.12);
    -- Amounts are VAT-inclusive: VAT = amount x rate / (1 + rate).
    new.vat_amount := round(new.amount * new.vat_rate / (1 + new.vat_rate), 2);
  else
    new.vat_rate := null;
    new.vat_amount := 0;
  end if;

  new.net_of_vat := new.amount - new.vat_amount;
  return new;
end;
$$;

revoke all on function private.payments_apply_vat() from public, anon, authenticated;

create trigger payments_apply_vat
before insert or update of amount, vat_treatment, vat_rate on public.payments
for each row execute function private.payments_apply_vat();

-- Backfill: assigning null fires the trigger, which stamps from the settings
-- row seeded above (non-VAT until the owner says otherwise).
update public.payments set vat_treatment = null;

alter table public.payments
  alter column vat_treatment set not null,
  alter column vat_amount set not null,
  alter column net_of_vat set not null;

comment on column public.payments.vat_treatment is
  'Stamped from tax_settings when written. vatable rows carry vat_rate and a VAT-inclusive split.';

-- ---------------------------------------------------------------------------
-- 3. Expense ledger, categorized by BIR itemized-deduction line.
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  bir_line text not null check (char_length(trim(bir_line)) between 1 and 160),
  description text,
  -- Percent (5 = 5%). A hint: payments in this category usually need EWT.
  default_ewt_percent numeric(5, 2) check (default_ewt_percent is null or default_ewt_percent between 0 and 100),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expense_categories_set_updated_at
before update on public.expense_categories
for each row execute function private.set_updated_at();

-- Lines from the Schedule of Itemized Deductions that a car-rental fleet
-- actually uses. Depreciation is absent on purpose: it comes from the
-- fixed-asset register, never from a manual expense row.
-- EWT hints are common rates, not rulings -- confirm against current RR.
insert into public.expense_categories (code, name, bir_line, description, default_ewt_percent, sort_order)
values
  ('fuel_oil', 'Fuel and oil', 'Fuel and oil', 'Fuel for the fleet and service vehicles.', null, 10),
  ('repairs_labor', 'Repairs and maintenance (labor)', 'Repairs and maintenance (labor or labor and materials)', 'Servicing and bodywork billed as labor, or labor with parts.', 2, 20),
  ('repairs_materials', 'Repairs and maintenance (materials)', 'Repairs and maintenance (materials/supplies)', 'Parts, tires, batteries and supplies bought outright.', 1, 21),
  ('insurance', 'Insurance', 'Insurance', 'CTPL and comprehensive cover per vehicle.', null, 30),
  ('taxes_licenses', 'Taxes and licenses', 'Taxes and licenses', 'LTO registration and renewal, mayor''s/business permit, DTI renewal.', null, 40),
  ('salaries_wages', 'Salaries, wages and allowances', 'Salaries, wages and allowances', 'Drivers and front-desk staff.', null, 50),
  ('statutory_contributions', 'SSS, PhilHealth and Pag-IBIG', 'SSS, GSIS, Medicare, HDMF and other contributions', 'Employer share of statutory contributions.', null, 51),
  ('rental', 'Rental', 'Rental', 'Garage, parking and office rent.', 5, 60),
  ('light_water', 'Light and water', 'Communication, light and water', 'Electricity and water.', null, 70),
  ('communication', 'Communication', 'Communication, light and water', 'Internet, mobile plans and landline.', null, 71),
  ('professional_fees', 'Professional fees', 'Professional fees', 'Accountant, lawyer and other professionals.', 10, 80),
  ('advertising', 'Advertising and promotions', 'Advertising and promotions', 'Online ads, printing and promotions.', null, 90),
  ('transportation_travel', 'Transportation and travel', 'Transportation and travel', 'Delivery and retrieval of units, staff travel.', null, 100),
  ('interest', 'Interest', 'Interest', 'Interest on fleet financing and loans.', null, 110),
  ('office_supplies', 'Office supplies', 'Office supplies', 'Stationery and consumables.', null, 120),
  ('security_services', 'Security services', 'Security services', 'Guards and monitoring services.', 2, 130),
  ('janitorial', 'Janitorial and messengerial services', 'Janitorial and messengerial services', 'Car wash, cleaning and messengers.', 2, 140),
  ('representation', 'Representation and entertainment', 'Representation and entertainment', 'Client meals and entertainment (capped by BIR).', null, 150),
  ('miscellaneous', 'Miscellaneous', 'Miscellaneous', 'Anything not covered by a line above.', null, 999);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  -- Optional: tags the cost to one unit for per-vehicle margin.
  vehicle_id uuid references public.vehicles (id) on delete set null,
  description text not null check (char_length(trim(description)) between 1 and 300),
  supplier_name text check (supplier_name is null or char_length(trim(supplier_name)) between 1 and 200),
  supplier_tin text check (supplier_tin is null or supplier_tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  supplier_vat_registered boolean not null default false,
  document_type text not null default 'vat_invoice' check (document_type in (
    'vat_invoice', 'non_vat_invoice', 'official_receipt',
    'acknowledgement_receipt', 'payroll', 'none'
  )),
  document_number text check (document_number is null or char_length(trim(document_number)) between 1 and 80),
  -- What was paid, VAT included. input_vat is the VAT shown on the invoice.
  gross_amount numeric(12, 2) not null check (gross_amount > 0),
  input_vat numeric(12, 2) not null default 0 check (input_vat >= 0),
  net_amount numeric(12, 2) generated always as (gross_amount - input_vat) stored,
  withholding_required boolean not null default false,
  ewt_percent numeric(5, 2) check (ewt_percent is null or ewt_percent between 0 and 100),
  -- Derived by trigger from net_amount x ewt_percent; never typed by hand.
  ewt_amount numeric(12, 2) not null default 0 check (ewt_amount >= 0),
  ewt_remitted boolean not null default false,
  payment_method text check (payment_method in ('cash', 'bank', 'gcash', 'maya', 'check', 'other')),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_input_vat_below_gross check (input_vat < gross_amount)
);

create index expenses_expense_date_idx on public.expenses (expense_date);
create index expenses_category_id_idx on public.expenses (category_id);
create index expenses_vehicle_id_idx on public.expenses (vehicle_id) where vehicle_id is not null;
create index expenses_created_by_idx on public.expenses (created_by);

create or replace function private.expenses_derive_withholding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.withholding_required and new.ewt_percent is not null then
    -- EWT is withheld on the amount net of VAT.
    new.ewt_amount := round((new.gross_amount - new.input_vat) * new.ewt_percent / 100, 2);
  elsif new.withholding_required then
    new.ewt_amount := 0;
  else
    new.ewt_percent := null;
    new.ewt_amount := 0;
    new.ewt_remitted := false;
  end if;
  return new;
end;
$$;

revoke all on function private.expenses_derive_withholding() from public, anon, authenticated;

create trigger expenses_derive_withholding
before insert or update on public.expenses
for each row execute function private.expenses_derive_withholding();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Fixed-asset register. Depreciation is computed from these rows on read.
-- ---------------------------------------------------------------------------
create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  -- One register row per vehicle; other asset classes leave it null.
  vehicle_id uuid unique references public.vehicles (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  asset_class text not null default 'vehicle' check (asset_class in (
    'vehicle', 'equipment', 'furniture', 'leasehold_improvement', 'other'
  )),
  acquisition_date date not null,
  acquisition_cost numeric(14, 2) not null check (acquisition_cost > 0),
  salvage_value numeric(14, 2) not null default 0 check (salvage_value >= 0),
  useful_life_months integer not null default 60 check (useful_life_months between 1 and 600),
  depreciation_method text not null default 'straight_line' check (depreciation_method in (
    'straight_line', 'declining_balance', 'sum_of_years_digits'
  )),
  supplier_name text check (supplier_name is null or char_length(trim(supplier_name)) between 1 and 200),
  document_number text check (document_number is null or char_length(trim(document_number)) between 1 and 80),
  disposed_on date,
  disposal_proceeds numeric(14, 2) check (disposal_proceeds is null or disposal_proceeds >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_assets_salvage_below_cost check (salvage_value < acquisition_cost),
  constraint fixed_assets_disposed_after_acquired
    check (disposed_on is null or disposed_on >= acquisition_date),
  -- Accelerated methods run on whole years.
  constraint fixed_assets_accelerated_whole_years
    check (depreciation_method = 'straight_line' or useful_life_months % 12 = 0)
);

create trigger fixed_assets_set_updated_at
before update on public.fixed_assets
for each row execute function private.set_updated_at();

comment on table public.fixed_assets is
  'Fixed-asset register. RR 12-2012 limits vehicle depreciation for most taxpayers but carves out '
  'lessors of transportation equipment, which is this business, so fleet units are fully '
  'depreciable here. Confirm the current issuance with the accountant.';

-- ---------------------------------------------------------------------------
-- 5. BIR Form 2307 certificates received from clients who withheld tax.
--    Creditable against income tax; uncollected ones are money left with BIR.
-- ---------------------------------------------------------------------------
create table public.withholding_certificates (
  id uuid primary key default gen_random_uuid(),
  payor_name text not null check (char_length(trim(payor_name)) between 1 and 200),
  payor_tin text check (payor_tin is null or payor_tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  customer_id uuid references public.customers (id) on delete set null,
  rental_id uuid references public.rentals (id) on delete set null,
  atc_code text check (atc_code is null or atc_code ~ '^[A-Z]{2}[0-9]{3}$'),
  period_from date not null,
  period_to date not null,
  income_payment numeric(14, 2) not null check (income_payment > 0),
  tax_withheld numeric(14, 2) not null check (tax_withheld > 0),
  status text not null default 'pending' check (status in ('pending', 'received')),
  received_on date,
  certificate_reference text check (certificate_reference is null or char_length(trim(certificate_reference)) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withholding_certificates_period check (period_to >= period_from),
  constraint withholding_certificates_withheld_below_payment check (tax_withheld < income_payment),
  constraint withholding_certificates_received_dated
    check (status <> 'received' or received_on is not null)
);

create index withholding_certificates_period_to_idx on public.withholding_certificates (period_to);
create index withholding_certificates_customer_id_idx on public.withholding_certificates (customer_id)
  where customer_id is not null;
create index withholding_certificates_rental_id_idx on public.withholding_certificates (rental_id)
  where rental_id is not null;

create trigger withholding_certificates_set_updated_at
before update on public.withholding_certificates
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS and grants: owner-only for every finance table.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'expense_categories', 'expenses', 'fixed_assets', 'withholding_certificates'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated', v_table);
    execute format('grant select, insert, update on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_finance_user()))',
      v_table || '_select_owner', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_finance_user()))',
      v_table || '_insert_owner', v_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_finance_user())) with check ((select private.is_finance_user()))',
      v_table || '_update_owner', v_table);
  end loop;
end
$$;

-- Ledger rows are voided, never deleted; register rows are disposed.
-- Certificates entered by mistake may be deleted.
grant delete on table public.withholding_certificates to authenticated;
create policy withholding_certificates_delete_owner
on public.withholding_certificates for delete to authenticated
using ((select private.is_finance_user()));

-- ---------------------------------------------------------------------------
-- 7. Read views with display labels. SECURITY INVOKER: base-table RLS applies.
-- ---------------------------------------------------------------------------
create view public.expense_ledger
with (security_invoker = true)
as
select
  e.*,
  c.name as category_name,
  c.bir_line,
  v.plate_number as vehicle_plate
from public.expenses e
join public.expense_categories c on c.id = e.category_id
left join public.vehicles v on v.id = e.vehicle_id;

create view public.fixed_asset_register
with (security_invoker = true)
as
select
  fa.*,
  v.plate_number as vehicle_plate,
  case when fa.disposed_on is null then 'active' else 'disposed' end as status
from public.fixed_assets fa
left join public.vehicles v on v.id = fa.vehicle_id;

revoke all on public.expense_ledger, public.fixed_asset_register from anon, authenticated;
grant select on public.expense_ledger, public.fixed_asset_register to authenticated;
grant select on public.expense_ledger, public.fixed_asset_register to service_role;

-- ---------------------------------------------------------------------------
-- 8. finance_statement: every SQL-side figure of the statement, one snapshot.
--
--    Window: Manila local dates, inclusive -- same convention as analytics.
--    Receipts are cash-basis by payments.confirmed_at. Expenses by
--    expense_date. Certificates by the period they cover (period_to).
--    Depreciation is NOT here; the app adds it from fixed_assets.
--
--    receipts sign: deposit/balance/adjustment +, refund -, penalty 0
--    (penalties are accrued charges; settlement arrives as a balance row).
-- ---------------------------------------------------------------------------
create or replace function public.finance_statement(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_receipts jsonb;
  v_withholding jsonb;
  v_expenses jsonb;
  v_vehicles jsonb;
  v_monthly jsonb;
  v_exceptions jsonb;
begin
  if not private.is_finance_user() then
    raise exception 'Financial statements are available to the owner only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid statement window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Statement window cannot exceed 400 days.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  -- Block A: gross receipts -------------------------------------------------
  with ledger as (
    select
      p.*,
      r.booking_source,
      case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then 1
        when p.payment_type = 'refund' then -1
        else 0
      end as sign
    from public.payments p
    join public.rentals r on r.id = p.rental_id
    where p.status = 'confirmed'
      and p.confirmed_at >= v_from
      and p.confirmed_at < v_to
  )
  select jsonb_build_object(
    'gross_collected', coalesce(sum(l.amount) filter (where l.sign = 1), 0),
    'refunds', coalesce(sum(l.amount) filter (where l.sign = -1), 0),
    'net_receipts', coalesce(sum(l.sign * l.amount), 0),
    'vatable', coalesce(sum(l.sign * l.amount) filter (where l.vat_treatment = 'vatable'), 0),
    'zero_rated', coalesce(sum(l.sign * l.amount) filter (where l.vat_treatment = 'zero_rated'), 0),
    'exempt', coalesce(sum(l.sign * l.amount) filter (where l.vat_treatment = 'exempt'), 0),
    'non_vat', coalesce(sum(l.sign * l.amount) filter (where l.vat_treatment = 'non_vat'), 0),
    'output_vat', coalesce(sum(l.sign * l.vat_amount), 0),
    'net_of_vat', coalesce(sum(l.sign * l.net_of_vat), 0),
    'public_web', coalesce(sum(l.sign * l.amount) filter (where l.booking_source = 'public_web'), 0),
    'ops', coalesce(sum(l.sign * l.amount) filter (where l.booking_source is distinct from 'public_web'), 0),
    'penalties_billed', coalesce(sum(l.amount) filter (where l.payment_type = 'penalty'), 0),
    'payment_count', count(*) filter (where l.sign <> 0)
  )
  into v_receipts
  from ledger l;

  -- Accrual view: what customers still owe on cars that have gone out
  -- (same formula as analytics_overview.outstanding_balance).
  v_receipts := v_receipts || jsonb_build_object(
    'outstanding_balance',
    (
      select coalesce(sum(greatest(
        0,
        coalesce(r.quoted_total, 0) + coalesce(led.penalties, 0) - coalesce(led.credits, 0)
      )), 0)
      from public.rentals r
      left join lateral (
        select
          sum(case
            when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
            when p.payment_type = 'refund' then -p.amount
            else 0
          end) as credits,
          sum(p.amount) filter (where p.payment_type = 'penalty') as penalties
        from public.payments p
        where p.rental_id = r.id
          and p.status = 'confirmed'
      ) led on true
      where r.status in ('active', 'overdue', 'completed')
    )
  );

  -- Withholding: 2307s received (credits) and EWT the business owes ---------
  select jsonb_build_object(
    'cwt_withheld', coalesce((
      select sum(w.tax_withheld) from public.withholding_certificates w
      where w.period_to between p_from and p_to
    ), 0),
    'cwt_received', coalesce((
      select sum(w.tax_withheld) from public.withholding_certificates w
      where w.period_to between p_from and p_to and w.status = 'received'
    ), 0),
    'cwt_pending', coalesce((
      select sum(w.tax_withheld) from public.withholding_certificates w
      where w.period_to between p_from and p_to and w.status = 'pending'
    ), 0),
    'cwt_income_payments', coalesce((
      select sum(w.income_payment) from public.withholding_certificates w
      where w.period_to between p_from and p_to
    ), 0),
    'ewt_withheld', coalesce((
      select sum(e.ewt_amount) from public.expenses e
      where e.status = 'recorded' and e.withholding_required
        and e.expense_date between p_from and p_to
    ), 0),
    'ewt_unremitted', coalesce((
      select sum(e.ewt_amount) from public.expenses e
      where e.status = 'recorded' and e.withholding_required and not e.ewt_remitted
        and e.expense_date between p_from and p_to
    ), 0)
  )
  into v_withholding;

  -- Block B: expenses per BIR line (every active category, even when zero) --
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, x.name), '[]'::jsonb)
  into v_expenses
  from (
    select
      c.id as category_id,
      c.code,
      c.name,
      c.bir_line,
      c.sort_order,
      count(e.id) as entries,
      coalesce(sum(e.gross_amount), 0) as gross,
      coalesce(sum(e.input_vat), 0) as input_vat,
      coalesce(sum(e.net_amount), 0) as net,
      coalesce(sum(e.input_vat) filter (
        where e.supplier_vat_registered and e.document_type = 'vat_invoice'
      ), 0) as creditable_input_vat,
      coalesce(sum(e.ewt_amount), 0) as ewt,
      -- Deductions BIR would likely disallow: no valid document, or
      -- withholding required but not remitted.
      coalesce(sum(e.net_amount) filter (
        where e.document_type = 'none'
          or (e.document_type <> 'payroll' and nullif(trim(e.document_number), '') is null)
          or (e.withholding_required and not e.ewt_remitted)
      ), 0) as at_risk
    from public.expense_categories c
    left join public.expenses e
      on e.category_id = c.id
     and e.status = 'recorded'
     and e.expense_date between p_from and p_to
    where c.is_active or e.id is not null
    group by c.id
  ) x;

  -- Per-vehicle revenue and tagged costs (depreciation added by the app) ----
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.plate_number), '[]'::jsonb)
  into v_vehicles
  from (
    select
      v.id as vehicle_id,
      v.plate_number,
      v.name,
      v.status::text as status,
      coalesce((
        select sum(
          case
            when p.payment_type in ('deposit', 'balance', 'adjustment') then p.net_of_vat
            when p.payment_type = 'refund' then -p.net_of_vat
            else 0
          end)
        from public.payments p
        join public.rentals r on r.id = p.rental_id
        where r.vehicle_id = v.id
          and p.status = 'confirmed'
          and p.confirmed_at >= v_from
          and p.confirmed_at < v_to
      ), 0) as receipts_net_of_vat,
      coalesce((
        select sum(e.net_amount)
        from public.expenses e
        where e.vehicle_id = v.id
          and e.status = 'recorded'
          and e.expense_date between p_from and p_to
      ), 0) as expenses_net
    from public.vehicles v
  ) x;

  -- Monthly breakdown (quarterly returns list their months) ------------------
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.month), '[]'::jsonb)
  into v_monthly
  from (
    select
      to_char(m.month_start, 'YYYY-MM') as month,
      coalesce((
        select sum(case
          when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
          when p.payment_type = 'refund' then -p.amount
          else 0 end)
        from public.payments p
        where p.status = 'confirmed'
          and p.confirmed_at >= greatest(v_from, m.month_start::timestamp at time zone 'Asia/Manila')
          and p.confirmed_at < least(v_to, (m.month_start + interval '1 month')::timestamp at time zone 'Asia/Manila')
      ), 0) as net_receipts,
      coalesce((
        select sum(case
          when p.payment_type in ('deposit', 'balance', 'adjustment') then p.vat_amount
          when p.payment_type = 'refund' then -p.vat_amount
          else 0 end)
        from public.payments p
        where p.status = 'confirmed'
          and p.confirmed_at >= greatest(v_from, m.month_start::timestamp at time zone 'Asia/Manila')
          and p.confirmed_at < least(v_to, (m.month_start + interval '1 month')::timestamp at time zone 'Asia/Manila')
      ), 0) as output_vat,
      coalesce((
        select sum(e.net_amount) from public.expenses e
        where e.status = 'recorded'
          and e.expense_date between greatest(p_from, m.month_start::date)
                                 and least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
      ), 0) as expenses_net,
      coalesce((
        select sum(e.input_vat) from public.expenses e
        where e.status = 'recorded'
          and e.supplier_vat_registered and e.document_type = 'vat_invoice'
          and e.expense_date between greatest(p_from, m.month_start::date)
                                 and least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
      ), 0) as creditable_input_vat,
      coalesce((
        select sum(e.ewt_amount) from public.expenses e
        where e.status = 'recorded' and e.withholding_required
          and e.expense_date between greatest(p_from, m.month_start::date)
                                 and least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
      ), 0) as ewt
    from generate_series(
      date_trunc('month', p_from::timestamp),
      date_trunc('month', p_to::timestamp),
      interval '1 month'
    ) as m(month_start)
  ) x;

  -- Block E: exceptions -------------------------------------------------------
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.severity_rank, x.kind, x.occurred_on), '[]'::jsonb)
  into v_exceptions
  from (
    select 'missing_document' as kind, 'high' as severity, 1 as severity_rank,
           'expense' as record_type, e.id as record_id, e.description as label,
           e.net_amount as amount, e.expense_date as occurred_on
    from public.expenses e
    where e.status = 'recorded'
      and e.expense_date between p_from and p_to
      and (e.document_type = 'none'
           or (e.document_type <> 'payroll' and nullif(trim(e.document_number), '') is null))

    union all
    select 'withholding_not_remitted', 'high', 1,
           'expense', e.id, e.description, e.ewt_amount, e.expense_date
    from public.expenses e
    where e.status = 'recorded'
      and e.expense_date between p_from and p_to
      and e.withholding_required and not e.ewt_remitted

    union all
    select 'vehicle_without_cost', 'high', 1,
           'vehicle', v.id, concat_ws(' · ', v.plate_number, v.name), null::numeric, null::date
    from public.vehicles v
    where v.status <> 'inactive'
      and not exists (select 1 from public.fixed_assets fa where fa.vehicle_id = v.id)

    union all
    select 'input_vat_not_creditable', 'medium', 2,
           'expense', e.id, e.description, e.input_vat, e.expense_date
    from public.expenses e
    where e.status = 'recorded'
      and e.expense_date between p_from and p_to
      and e.input_vat > 0
      and (not e.supplier_vat_registered or e.document_type <> 'vat_invoice')

    union all
    select 'missing_supplier_tin', 'medium', 2,
           'expense', e.id, e.description, e.net_amount, e.expense_date
    from public.expenses e
    where e.status = 'recorded'
      and e.expense_date between p_from and p_to
      and e.document_type in ('vat_invoice', 'non_vat_invoice', 'official_receipt')
      and e.supplier_tin is null

    union all
    select 'certificate_pending', 'medium', 2,
           'certificate', w.id, w.payor_name, w.tax_withheld, w.period_to
    from public.withholding_certificates w
    where w.status = 'pending'
      and w.period_to between p_from and p_to

    union all
    select 'withholding_expected', 'low', 3,
           'expense', e.id, e.description, e.net_amount, e.expense_date
    from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    where e.status = 'recorded'
      and e.expense_date between p_from and p_to
      and c.default_ewt_percent is not null
      and not e.withholding_required
  ) x;

  return jsonb_build_object(
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'receipts', v_receipts,
    'withholding', v_withholding,
    'expenses', v_expenses,
    'vehicles', v_vehicles,
    'monthly', v_monthly,
    'exceptions', v_exceptions
  );
end;
$$;

revoke all on function public.finance_statement(date, date) from public, anon;
grant execute on function public.finance_statement(date, date) to authenticated;

comment on function public.finance_statement(date, date) is
  'Owner-only statement snapshot for Manila dates p_from..p_to inclusive. '
  'Receipts cash-basis by confirmed_at; depreciation is added by the app.';

-- ---------------------------------------------------------------------------
-- 9. Re-stamp VAT treatment after the owner changes VAT registration.
--    Applies the CURRENT settings to payments confirmed (or, if unconfirmed,
--    submitted) on or after p_from (Manila). Returns the number of rows.
-- ---------------------------------------------------------------------------
create or replace function public.finance_restamp_payment_vat(p_from date)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_finance_user() then
    raise exception 'Only the owner can re-apply VAT treatment.' using errcode = '42501';
  end if;
  if p_from is null then
    raise exception 'A start date is required.' using errcode = '22023';
  end if;

  update public.payments p
  set vat_treatment = null
  where coalesce(p.confirmed_at, p.submitted_at)
        >= (p_from::timestamp at time zone 'Asia/Manila');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.finance_restamp_payment_vat(date) from public, anon;
grant execute on function public.finance_restamp_payment_vat(date) to authenticated;
