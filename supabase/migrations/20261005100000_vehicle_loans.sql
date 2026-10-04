-- ===========================================================================
-- Vehicle loans (car mortgages) and the per-vehicle overview.
--
-- A loan is entered the way the bank's disclosure states it: amount financed,
-- monthly amortization, number of months, first due date. The app derives the
-- month-by-month schedule (src/features/finance/lib/loan-schedule.ts), the same
-- way depreciation is computed on read rather than stored.
--
-- Only the INTEREST part of an installment is a deductible expense. Recording
-- a payment therefore writes two rows atomically: the loan payment (principal
-- + interest, for the loan balance) and an `Interest` expense tagged to the
-- vehicle (for the statement and per-vehicle margin). Principal pays down the
-- liability and never reaches the expense ledger; the car itself is costed
-- through the fixed-asset register.
--
-- Owner-only, like the rest of the books.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. vehicle_loans
-- ---------------------------------------------------------------------------
create table public.vehicle_loans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  lender_name text not null check (char_length(trim(lender_name)) between 1 and 200),
  account_number text check (account_number is null or char_length(trim(account_number)) between 1 and 80),
  amount_financed numeric(14, 2) not null check (amount_financed > 0),
  monthly_amortization numeric(12, 2) not null check (monthly_amortization > 0),
  term_months integer not null check (term_months between 1 and 120),
  first_due_date date not null,
  -- Installments settled before the loan was entered here. They reduce the
  -- balance but post no expense (those months were booked elsewhere, if at all).
  installments_paid_before integer not null default 0 check (installments_paid_before >= 0),
  -- How each installment splits into interest and principal:
  --   effective     -- interest on the outstanding balance at the rate implied
  --                    by the amortization (what bank schedules show)
  --   straight_line -- total interest spread evenly across the term
  interest_method text not null default 'effective'
    check (interest_method in ('effective', 'straight_line')),
  status text not null default 'active' check (status in ('active', 'paid_off', 'closed')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_loans_payments_cover_principal
    check (monthly_amortization * term_months >= amount_financed),
  constraint vehicle_loans_paid_before_within_term
    check (installments_paid_before < term_months)
);

create index vehicle_loans_vehicle_id_idx on public.vehicle_loans (vehicle_id);
create index vehicle_loans_created_by_idx on public.vehicle_loans (created_by);
-- One running loan per car; a refinanced or paid-off loan stays as history.
create unique index vehicle_loans_one_active_per_vehicle
  on public.vehicle_loans (vehicle_id) where status = 'active';

create trigger vehicle_loans_set_updated_at
before update on public.vehicle_loans
for each row execute function private.set_updated_at();

comment on table public.vehicle_loans is
  'Car loans as the bank discloses them. The installment schedule is derived by the app.';

-- ---------------------------------------------------------------------------
-- 2. vehicle_loan_payments
-- ---------------------------------------------------------------------------
create table public.vehicle_loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.vehicle_loans (id) on delete restrict,
  installment_number integer not null check (installment_number >= 1),
  paid_on date not null,
  principal_amount numeric(12, 2) not null check (principal_amount >= 0),
  interest_amount numeric(12, 2) not null check (interest_amount >= 0),
  amount_paid numeric(12, 2) generated always as (principal_amount + interest_amount) stored,
  payment_method text check (payment_method in ('cash', 'bank', 'gcash', 'maya', 'check', 'other')),
  reference_number text check (reference_number is null or char_length(trim(reference_number)) between 1 and 80),
  -- The Interest expense this payment posted (null when interest was zero).
  expense_id uuid references public.expenses (id) on delete set null,
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_loan_payments_positive check (principal_amount + interest_amount > 0)
);

create index vehicle_loan_payments_loan_id_idx on public.vehicle_loan_payments (loan_id);
create index vehicle_loan_payments_expense_id_idx on public.vehicle_loan_payments (expense_id)
  where expense_id is not null;
create index vehicle_loan_payments_created_by_idx on public.vehicle_loan_payments (created_by);
create unique index vehicle_loan_payments_one_per_installment
  on public.vehicle_loan_payments (loan_id, installment_number) where status = 'recorded';

create trigger vehicle_loan_payments_set_updated_at
before update on public.vehicle_loan_payments
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: owner only. Rows are closed or voided, never deleted.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array['vehicle_loans', 'vehicle_loan_payments'] loop
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

-- ---------------------------------------------------------------------------
-- 4. record_vehicle_loan_payment: loan payment + Interest expense, atomically.
--    The split comes from the caller (prefilled from the app's schedule, and
--    editable to match the bank's statement).
-- ---------------------------------------------------------------------------
create or replace function public.record_vehicle_loan_payment(
  p_loan_id uuid,
  p_installment_number integer,
  p_paid_on date,
  p_principal numeric,
  p_interest numeric,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_loan public.vehicle_loans%rowtype;
  v_category uuid;
  v_expense uuid;
  v_payment uuid;
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
  v_settled integer;
begin
  if not private.is_finance_user() then
    raise exception 'Only the owner can record loan payments.' using errcode = '42501';
  end if;

  select * into v_loan from public.vehicle_loans where id = p_loan_id for update;
  if not found then
    raise exception 'The loan was not found.' using errcode = 'P0002';
  end if;
  if v_loan.status <> 'active' then
    raise exception 'This loan is no longer active.' using errcode = '22023';
  end if;
  if p_installment_number is null
    or p_installment_number <= v_loan.installments_paid_before
    or p_installment_number > v_loan.term_months then
    raise exception 'That installment is not open on this loan.' using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'A payment date is required.' using errcode = '22023';
  end if;
  if coalesce(p_principal, -1) < 0 or coalesce(p_interest, -1) < 0
    or p_principal + p_interest <= 0 then
    raise exception 'Principal and interest must be zero or more, and not both zero.'
      using errcode = '22023';
  end if;

  if p_interest > 0 then
    select c.id into v_category
    from public.expense_categories c
    where c.code = 'interest';
    if v_category is null then
      raise exception 'The Interest expense line is missing.' using errcode = 'P0002';
    end if;

    insert into public.expenses (
      expense_date, category_id, vehicle_id, description, supplier_name,
      document_type, document_number, gross_amount, payment_method, notes
    )
    values (
      p_paid_on,
      v_category,
      v_loan.vehicle_id,
      format('Loan interest, installment %s of %s', p_installment_number, v_loan.term_months),
      v_loan.lender_name,
      -- A bank receipt or statement reference backs the deduction; without
      -- one the statement flags the row as missing its document.
      case when v_reference is null then 'none' else 'official_receipt' end,
      v_reference,
      round(p_interest, 2),
      p_payment_method,
      'Posted from the vehicle loan schedule.'
    )
    returning id into v_expense;
  end if;

  insert into public.vehicle_loan_payments (
    loan_id, installment_number, paid_on, principal_amount, interest_amount,
    payment_method, reference_number, expense_id, notes
  )
  values (
    p_loan_id, p_installment_number, p_paid_on, round(p_principal, 2), round(p_interest, 2),
    p_payment_method, v_reference, v_expense, nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_payment;

  select v_loan.installments_paid_before + count(*)
  into v_settled
  from public.vehicle_loan_payments lp
  where lp.loan_id = p_loan_id and lp.status = 'recorded';

  if v_settled >= v_loan.term_months then
    update public.vehicle_loans set status = 'paid_off' where id = p_loan_id;
  end if;

  return v_payment;
exception
  when unique_violation then
    raise exception 'That installment is already recorded.' using errcode = '23505';
end;
$$;

revoke all on function public.record_vehicle_loan_payment(uuid, integer, date, numeric, numeric, text, text, text)
  from public, anon;
grant execute on function public.record_vehicle_loan_payment(uuid, integer, date, numeric, numeric, text, text, text)
  to authenticated;

comment on function public.record_vehicle_loan_payment(uuid, integer, date, numeric, numeric, text, text, text) is
  'Owner-only. Records one installment and posts its interest as a vehicle-tagged Interest expense.';

-- ---------------------------------------------------------------------------
-- 5. void_vehicle_loan_payment: undo a mistaken entry and its expense.
-- ---------------------------------------------------------------------------
create or replace function public.void_vehicle_loan_payment(p_payment_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_payment public.vehicle_loan_payments%rowtype;
begin
  if not private.is_finance_user() then
    raise exception 'Only the owner can void loan payments.' using errcode = '42501';
  end if;

  select * into v_payment
  from public.vehicle_loan_payments
  where id = p_payment_id and status = 'recorded'
  for update;
  if not found then
    raise exception 'The loan payment was not found.' using errcode = 'P0002';
  end if;

  update public.vehicle_loan_payments set status = 'void' where id = p_payment_id;
  if v_payment.expense_id is not null then
    update public.expenses set status = 'void' where id = v_payment.expense_id;
  end if;
  update public.vehicle_loans
  set status = 'active'
  where id = v_payment.loan_id and status = 'paid_off';
end;
$$;

revoke all on function public.void_vehicle_loan_payment(uuid) from public, anon;
grant execute on function public.void_vehicle_loan_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. vehicle_overview: one car's performance for a Manila date window.
--
--    Owner and admin see rentals, utilization and income. Costs, the monthly
--    expense series and expense/loan activity are filled in only for the
--    finance user (owner); for anyone else they are null / omitted.
--    Income is cash-basis and net of VAT, matching finance_statement.
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_overview(p_vehicle_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_finance boolean := private.is_finance_user();
  v_summary jsonb;
  v_categories jsonb;
  v_monthly jsonb;
  v_activity jsonb;
begin
  if not private.is_org_admin() then
    raise exception 'Vehicle analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'The window cannot exceed 400 days.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id) then
    raise exception 'The vehicle was not found.' using errcode = 'P0002';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  -- Summary ------------------------------------------------------------------
  select jsonb_build_object(
    'window_days', p_to - p_from + 1,
    'rental_count', (
      select count(*)
      from public.rentals r
      where r.vehicle_id = p_vehicle_id
        and r.status in ('reserved', 'active', 'overdue', 'completed')
        and r.start_at < v_to
        and private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at) > v_from
    ),
    'rented_days', (
      select coalesce(sum(private.analytics_rented_days(
        r.start_at,
        private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
        v_from, v_to)), 0)
      from public.rentals r
      where r.vehicle_id = p_vehicle_id
        and r.status in ('reserved', 'active', 'overdue', 'completed')
    ),
    'collected', coalesce((
      select sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0 end)
      from public.payments p
      join public.rentals r on r.id = p.rental_id
      where r.vehicle_id = p_vehicle_id
        and p.status = 'confirmed'
        and p.confirmed_at >= v_from and p.confirmed_at < v_to
    ), 0),
    'income', coalesce((
      select sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.net_of_vat
        when p.payment_type = 'refund' then -p.net_of_vat
        else 0 end)
      from public.payments p
      join public.rentals r on r.id = p.rental_id
      where r.vehicle_id = p_vehicle_id
        and p.status = 'confirmed'
        and p.confirmed_at >= v_from and p.confirmed_at < v_to
    ), 0),
    'expenses', case when v_finance then coalesce((
      select sum(e.net_amount)
      from public.expenses e
      where e.vehicle_id = p_vehicle_id
        and e.status = 'recorded'
        and e.expense_date between p_from and p_to
    ), 0) end
  )
  into v_summary;

  -- Costs by BIR line (owner only) -------------------------------------------
  if v_finance then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.amount desc), '[]'::jsonb)
    into v_categories
    from (
      select c.id as category_id, c.name, sum(e.net_amount) as amount, count(*) as entries
      from public.expenses e
      join public.expense_categories c on c.id = e.category_id
      where e.vehicle_id = p_vehicle_id
        and e.status = 'recorded'
        and e.expense_date between p_from and p_to
      group by c.id, c.name
    ) x;
  end if;

  -- Monthly series -------------------------------------------------------------
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.month), '[]'::jsonb)
  into v_monthly
  from (
    select
      to_char(m.month_start, 'YYYY-MM') as month,
      coalesce((
        select sum(case
          when p.payment_type in ('deposit', 'balance', 'adjustment') then p.net_of_vat
          when p.payment_type = 'refund' then -p.net_of_vat
          else 0 end)
        from public.payments p
        join public.rentals r on r.id = p.rental_id
        where r.vehicle_id = p_vehicle_id
          and p.status = 'confirmed'
          and p.confirmed_at >= greatest(v_from, m.month_start::timestamp at time zone 'Asia/Manila')
          and p.confirmed_at < least(v_to, (m.month_start + interval '1 month')::timestamp at time zone 'Asia/Manila')
      ), 0) as income,
      case when v_finance then coalesce((
        select sum(e.net_amount)
        from public.expenses e
        where e.vehicle_id = p_vehicle_id
          and e.status = 'recorded'
          and e.expense_date between greatest(p_from, m.month_start::date)
                                 and least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
      ), 0) end as expenses,
      (
        select coalesce(sum(private.analytics_rented_days(
          r.start_at,
          private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
          greatest(v_from, m.month_start::timestamp at time zone 'Asia/Manila'),
          least(v_to, (m.month_start + interval '1 month')::timestamp at time zone 'Asia/Manila'))), 0)
        from public.rentals r
        where r.vehicle_id = p_vehicle_id
          and r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as rented_days
    from generate_series(
      date_trunc('month', p_from::timestamp),
      date_trunc('month', p_to::timestamp),
      interval '1 month'
    ) as m(month_start)
  ) x;

  -- Activity: what happened to this car in the window, newest first ----------
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.occurred_at desc, x.record_id), '[]'::jsonb)
  into v_activity
  from (
    (
      select
        'rental' as kind,
        r.start_at as occurred_at,
        'rental' as record_type,
        r.id as record_id,
        r.reference_number as label,
        c.full_name as detail,
        r.status::text as status,
        r.quoted_total as amount
      from public.rentals r
      left join public.customers c on c.id = r.customer_id
      where r.vehicle_id = p_vehicle_id
        and r.start_at >= v_from and r.start_at < v_to
    )
    union all
    (
      select
        'payment',
        p.confirmed_at,
        'rental',
        r.id,
        r.reference_number,
        p.payment_type::text,
        p.status::text,
        case when p.payment_type = 'refund' then -p.amount else p.amount end
      from public.payments p
      join public.rentals r on r.id = p.rental_id
      where r.vehicle_id = p_vehicle_id
        and p.status = 'confirmed'
        and p.confirmed_at >= v_from and p.confirmed_at < v_to
    )
    union all
    (
      select
        'expense',
        e.expense_date::timestamp at time zone 'Asia/Manila',
        'expense',
        e.id,
        e.description,
        c.name,
        e.status,
        e.gross_amount
      from public.expenses e
      join public.expense_categories c on c.id = e.category_id
      where v_finance
        and e.vehicle_id = p_vehicle_id
        and e.status = 'recorded'
        and e.expense_date between p_from and p_to
        -- Loan interest is shown through its loan payment row instead.
        and not exists (
          select 1 from public.vehicle_loan_payments lp
          where lp.expense_id = e.id and lp.status = 'recorded'
        )
    )
    union all
    (
      select
        'loan_payment',
        lp.paid_on::timestamp at time zone 'Asia/Manila',
        'loan',
        l.id,
        l.lender_name,
        format('Installment %s of %s', lp.installment_number, l.term_months),
        lp.status,
        lp.amount_paid
      from public.vehicle_loan_payments lp
      join public.vehicle_loans l on l.id = lp.loan_id
      where v_finance
        and l.vehicle_id = p_vehicle_id
        and lp.status = 'recorded'
        and lp.paid_on between p_from and p_to
    )
    order by 2 desc
    limit 60
  ) x;

  return jsonb_build_object(
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'finance_visible', v_finance,
    'summary', v_summary,
    'categories', v_categories,
    'monthly', v_monthly,
    'activity', v_activity
  );
end;
$$;

revoke all on function public.vehicle_overview(uuid, date, date) from public, anon;
grant execute on function public.vehicle_overview(uuid, date, date) to authenticated;

comment on function public.vehicle_overview(uuid, date, date) is
  'Owner/admin performance of one vehicle for Manila dates p_from..p_to inclusive. '
  'Costs and expense activity are included for the owner only.';
