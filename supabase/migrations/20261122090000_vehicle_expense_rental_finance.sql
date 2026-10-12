-- ===========================================================================
-- A vehicle expense tagged to a rental also lands in Finance.
--
-- The owner logs what a car cost on Expenses (vehicle_expenses): the car
-- wash, paying the delivery driver. Those are what the renter was billed for,
-- so the cost has to reach the Finance statement to cancel that income out.
-- Picking a rental on the vehicle expense now writes a matching row in the
-- finance `expenses` ledger; one entry covers the car's history, the rental's
-- bill and the statement.
--
-- 1. vehicle_expense_categories.expense_category_id: the BIR line a vehicle
--    category files under (Car wash → Janitorial, Fuel → Fuel and oil, …).
--    Adds a Delivery category. Unmapped categories file as Miscellaneous.
-- 2. Picking a rental fills the vehicle; a rental on another car is refused.
-- 3. expenses.vehicle_expense_id links the Finance row to its vehicle expense.
--    The vehicle expense is the source: saving it keeps the Finance row in
--    step (date, car, rental, amount, vendor, OR number); untagging the rental
--    or deleting the expense voids it. The owner can still add VAT or a TIN in
--    Finance, and re-file it under another BIR line.
-- 4. A Finance row that came from a vehicle expense keeps its rental.
-- 5. list_rental_costs returns vehicle_expense_id, so the rental links to the
--    vehicle expense.
-- 6. Vehicle expenses already tagged to a rental get their Finance row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. BIR line per vehicle expense category
-- ---------------------------------------------------------------------------
alter table public.vehicle_expense_categories
  add column if not exists expense_category_id uuid
    references public.expense_categories (id) on delete set null;

comment on column public.vehicle_expense_categories.expense_category_id is
  'BIR deduction line a rental-tagged vehicle expense in this category files under in Finance. Null: Miscellaneous.';

insert into public.vehicle_expense_categories (name, sort_order)
select 'Delivery', 15
where not exists (
  select 1 from public.vehicle_expense_categories c where lower(trim(c.name)) = 'delivery'
);

update public.vehicle_expense_categories v
set expense_category_id = c.id
from (values
  ('car wash', 'janitorial'),
  ('delivery', 'transportation_travel'),
  ('fuel', 'fuel_oil'),
  ('repair', 'repairs_labor'),
  ('maintenance', 'repairs_labor'),
  ('tires', 'repairs_materials'),
  ('battery', 'repairs_materials'),
  ('accessories', 'repairs_materials'),
  ('registration (lto)', 'taxes_licenses'),
  ('insurance', 'insurance'),
  ('towing', 'transportation_travel'),
  ('parking & tolls', 'transportation_travel'),
  ('other', 'miscellaneous')
) as m(name, code)
join public.expense_categories c on c.code = m.code
where lower(trim(v.name)) = m.name
  and v.expense_category_id is null;

-- ---------------------------------------------------------------------------
-- 2. The rental decides the car
-- ---------------------------------------------------------------------------
create or replace function private.vehicle_expenses_follow_rental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_id uuid;
  v_plate text;
begin
  if new.rental_id is null then
    return new;
  end if;

  select r.vehicle_id, v.plate_number into v_vehicle_id, v_plate
  from public.rentals r
  join public.vehicles v on v.id = r.vehicle_id
  where r.id = new.rental_id;

  if new.vehicle_id is null then
    new.vehicle_id := v_vehicle_id;
  elsif v_vehicle_id is not null and new.vehicle_id <> v_vehicle_id then
    raise exception 'That rental was on %. Pick that car, or leave Vehicle blank.', v_plate
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.vehicle_expenses_follow_rental() from public, anon, authenticated;

drop trigger if exists vehicle_expenses_follow_rental on public.vehicle_expenses;
create trigger vehicle_expenses_follow_rental
before insert or update of rental_id, vehicle_id on public.vehicle_expenses
for each row execute function private.vehicle_expenses_follow_rental();

-- ---------------------------------------------------------------------------
-- 3. The Finance row of a rental-tagged vehicle expense
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists vehicle_expense_id uuid
    references public.vehicle_expenses (id) on delete set null;

comment on column public.expenses.vehicle_expense_id is
  'The vehicle expense (Expenses page) this Finance row was written from. That record is the source of the amount.';

create unique index if not exists expenses_vehicle_expense_id_key
  on public.expenses (vehicle_expense_id)
  where vehicle_expense_id is not null;

create or replace function private.sync_vehicle_expense_to_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mirror_id uuid;
  v_reference text;
  v_category_name text;
  v_category_id uuid;
  v_description text;
begin
  select e.id into v_mirror_id
  from public.expenses e
  where e.vehicle_expense_id = new.id
  for update;

  -- Not (or no longer) for a rental: it stays a vehicle cost only.
  if new.rental_id is null then
    if v_mirror_id is not null then
      update public.expenses set status = 'void'
      where id = v_mirror_id and status = 'recorded';
    end if;
    return null;
  end if;

  select r.reference_number into v_reference
  from public.rentals r
  where r.id = new.rental_id;

  select c.name, c.expense_category_id into v_category_name, v_category_id
  from public.vehicle_expense_categories c
  where c.id = new.category_id;

  v_category_id := coalesce(
    v_category_id,
    (select c.id from public.expense_categories c where c.code = 'miscellaneous')
  );
  v_description := left(
    coalesce(nullif(btrim(v_category_name), ''), 'Vehicle expense') || ' · ' || coalesce(v_reference, 'rental'),
    300
  );

  -- Lets this sync move the Finance row to another rental (see 4).
  perform set_config('app.vehicle_expense_sync', 'on', true);

  if v_mirror_id is null then
    insert into public.expenses (
      expense_date, category_id, vehicle_id, rental_id, vehicle_expense_id,
      description, supplier_name, document_type, document_number,
      gross_amount, notes
    )
    values (
      new.incurred_on,
      v_category_id,
      new.vehicle_id,
      new.rental_id,
      new.id,
      v_description,
      nullif(btrim(coalesce(new.vendor, '')), ''),
      'none',
      left(nullif(btrim(coalesce(new.reference, '')), ''), 80),
      new.amount,
      left(new.notes, 2000)
    );
  else
    update public.expenses e
    set
      expense_date = new.incurred_on,
      -- The owner may re-file it in Finance; only a new vehicle category moves it.
      category_id = case
        when tg_op = 'UPDATE' and new.category_id is distinct from old.category_id then v_category_id
        else e.category_id
      end,
      vehicle_id = new.vehicle_id,
      rental_id = new.rental_id,
      description = v_description,
      supplier_name = nullif(btrim(coalesce(new.vendor, '')), ''),
      document_number = left(nullif(btrim(coalesce(new.reference, '')), ''), 80),
      gross_amount = new.amount,
      -- Input VAT the owner typed survives unless it no longer fits.
      input_vat = case when e.input_vat < new.amount then e.input_vat else 0 end,
      notes = left(new.notes, 2000),
      -- Tagged to a rental again after being untagged: count it again.
      status = case
        when tg_op = 'UPDATE' and old.rental_id is null then 'recorded'
        else e.status
      end
    where e.id = v_mirror_id;
  end if;

  perform set_config('app.vehicle_expense_sync', 'off', true);
  return null;
end;
$$;

revoke all on function private.sync_vehicle_expense_to_finance() from public, anon, authenticated;

drop trigger if exists vehicle_expenses_sync_to_finance on public.vehicle_expenses;
create trigger vehicle_expenses_sync_to_finance
after insert or update on public.vehicle_expenses
for each row execute function private.sync_vehicle_expense_to_finance();

-- Deleting the vehicle expense voids its Finance row; the ledger keeps history.
create or replace function private.void_vehicle_expense_in_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.expenses
  set status = 'void'
  where vehicle_expense_id = old.id
    and status = 'recorded';
  return old;
end;
$$;

revoke all on function private.void_vehicle_expense_in_finance() from public, anon, authenticated;

drop trigger if exists vehicle_expenses_void_in_finance on public.vehicle_expenses;
create trigger vehicle_expenses_void_in_finance
before delete on public.vehicle_expenses
for each row execute function private.void_vehicle_expense_in_finance();

-- ---------------------------------------------------------------------------
-- 4. A Finance row from a bill line or a vehicle expense keeps its rental
--    (as 20261121090000, plus vehicle_expense_id and the sync's bypass)
-- ---------------------------------------------------------------------------
create or replace function private.expenses_follow_rental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A deleted rental (on delete set null) lets go; a form edit cannot.
  if tg_op = 'UPDATE'
    and (old.charge_payment_id is not null or old.rental_line is not null or old.vehicle_expense_id is not null)
    and new.rental_id is distinct from old.rental_id
    and coalesce(current_setting('app.vehicle_expense_sync', true), 'off') <> 'on'
    and exists (select 1 from public.rentals r where r.id = old.rental_id) then
    if old.vehicle_expense_id is not null then
      raise exception 'This cost comes from Expenses. Change its rental there.'
        using errcode = 'check_violation';
    end if;
    raise exception 'This cost was entered on a rental''s bill. Change or remove it from that rental.'
      using errcode = 'check_violation';
  end if;

  if new.rental_id is null then
    new.rental_line := null;
  elsif new.vehicle_id is null then
    select r.vehicle_id into new.vehicle_id
    from public.rentals r
    where r.id = new.rental_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Every cost on a rental, with the vehicle expense it came from
-- ---------------------------------------------------------------------------
create or replace function public.list_rental_costs(p_rental_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_open_finance', (select private.is_finance_user()),
    'costs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'expense_id', e.id,
          'payment_id', e.charge_payment_id,
          'line', e.rental_line,
          'vehicle_expense_id', e.vehicle_expense_id,
          'description', e.description,
          'category', c.name,
          'amount', e.gross_amount,
          'expense_date', e.expense_date
        ) order by e.expense_date, e.created_at)
      from public.expenses e
      join public.expense_categories c on c.id = e.category_id
      where e.rental_id = p_rental_id
        and e.status = 'recorded'
    ), '[]'::jsonb)
  )
  where (select private.is_org_admin());
$$;

-- ---------------------------------------------------------------------------
-- 6. Vehicle expenses already tagged to a rental
-- ---------------------------------------------------------------------------
update public.vehicle_expenses ve
set rental_id = ve.rental_id
where ve.rental_id is not null
  and not exists (select 1 from public.expenses e where e.vehicle_expense_id = ve.id);
