-- ===========================================================================
-- Rental charge costs: what a charge cost the business to deliver.
--
-- A charge on the bill (Delivery ₱500) is income. What the business paid to
-- deliver it (₱300 to the driver) is an expense. Staff enter both on one
-- charge; the cost is written as a row in the finance `expenses` ledger,
-- linked back to the charge and its rental, so the statement and BIR report
-- pick it up without a second entry.
--
-- 1. Each charge type names the BIR deduction line its cost files under.
-- 2. expenses gains rental_id and charge_payment_id; one live cost per charge.
-- 3. add_rental_charge takes an optional p_cost.
-- 4. set_rental_charge_cost adds, changes, or clears a charge's cost later
--    (the driver is often paid after the car is handed over).
-- 5. void_rental_charge voids the linked cost with the charge.
-- 6. list_rental_charge_costs lets owners and admins see the costs on a
--    rental. The rest of the expense ledger stays owner-only.
-- 7. expense_ledger shows which rental a cost came from.
--
-- The expense row is the one source of the cost. If the owner edits or voids
-- it in /finance, the rental shows that.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Where each charge type's cost is filed
-- ---------------------------------------------------------------------------
alter table public.rental_charge_types
  add column if not exists expense_category_id uuid
    references public.expense_categories (id) on delete set null;

comment on column public.rental_charge_types.expense_category_id is
  'BIR deduction line a cost entered on this charge files under. Null falls back to Miscellaneous.';

update public.rental_charge_types ct
set expense_category_id = c.id
from public.expense_categories c
where ct.expense_category_id is null
  and (ct.code, c.code) in (
    ('car_wash', 'janitorial'),
    ('delivery', 'transportation_travel'),
    ('fuel_shortage', 'fuel_oil'),
    ('damage', 'repairs_labor'),
    ('other_income', 'miscellaneous')
  );

-- ---------------------------------------------------------------------------
-- 2. Expenses link to the rental and the charge they came from
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists rental_id uuid
    references public.rentals (id) on delete set null,
  add column if not exists charge_payment_id uuid
    references public.payments (id) on delete set null;

comment on column public.expenses.rental_id is
  'The rental this cost was spent on, when it was entered from a rental charge.';
comment on column public.expenses.charge_payment_id is
  'The bill charge this is the cost of. At most one recorded expense per charge.';

create index if not exists expenses_rental_id_idx
  on public.expenses (rental_id) where rental_id is not null;
create unique index if not exists expenses_one_recorded_cost_per_charge
  on public.expenses (charge_payment_id)
  where charge_payment_id is not null and status = 'recorded';

-- ---------------------------------------------------------------------------
-- 3. Writing a charge's cost (internal; callers check the role)
-- ---------------------------------------------------------------------------
create or replace function private.set_charge_cost(p_payment_id uuid, p_cost numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric(12, 2) := round(coalesce(p_cost, 0), 2);
  v_charge record;
  v_category_id uuid;
  v_expense_id uuid;
begin
  if v_cost < 0 then
    raise exception 'The cost cannot be negative.' using errcode = '22023';
  end if;

  select
    p.id, p.rental_id, p.notes, ct.name as type_name, ct.code as type_code,
    ct.expense_category_id, r.vehicle_id, r.reference_number
  into v_charge
  from public.payments p
  join public.rental_charge_types ct on ct.id = p.charge_type_id
  join public.rentals r on r.id = p.rental_id
  where p.id = p_payment_id
    and p.payment_type = 'penalty'
    and p.status = 'confirmed'
    and p.amount > 0;
  if not found then
    raise exception 'That charge was not found or is removed.' using errcode = 'P0002';
  end if;
  if v_charge.type_code = 'bill_adjustment' then
    raise exception 'Bill adjustments do not carry a cost.' using errcode = 'check_violation';
  end if;

  select e.id into v_expense_id
  from public.expenses e
  where e.charge_payment_id = p_payment_id
    and e.status = 'recorded'
  for update;

  if v_cost = 0 then
    if v_expense_id is not null then
      update public.expenses set status = 'void' where id = v_expense_id;
    end if;
    return null;
  end if;

  if v_expense_id is not null then
    update public.expenses
    set
      gross_amount = v_cost,
      -- Input VAT the owner typed survives unless it no longer fits.
      input_vat = case when input_vat < v_cost then input_vat else 0 end
    where id = v_expense_id;
    return v_expense_id;
  end if;

  v_category_id := coalesce(
    v_charge.expense_category_id,
    (select c.id from public.expense_categories c where c.code = 'miscellaneous')
  );

  insert into public.expenses (
    expense_date, category_id, vehicle_id, rental_id, charge_payment_id,
    description, document_type, gross_amount, notes
  )
  values (
    (now() at time zone 'Asia/Manila')::date,
    v_category_id,
    v_charge.vehicle_id,
    v_charge.rental_id,
    p_payment_id,
    left(v_charge.type_name || ' · ' || coalesce(v_charge.reference_number, 'rental'), 300),
    'none',
    v_cost,
    v_charge.notes
  )
  returning id into v_expense_id;

  return v_expense_id;
end;
$$;

revoke all on function private.set_charge_cost(uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. add_rental_charge with an optional cost
-- ---------------------------------------------------------------------------
drop function if exists public.add_rental_charge(uuid, uuid, numeric, text);

create or replace function public.add_rental_charge(
  p_rental_id uuid,
  p_charge_type_id uuid,
  p_amount numeric,
  p_notes text default null,
  p_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.rental_status;
  v_type_active boolean;
  v_type_code text;
  v_payment_id uuid;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required to add charges.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'The cost cannot be negative.' using errcode = '22023';
  end if;
  if coalesce(p_cost, 0) > 0 and not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can record what a charge cost.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select ct.is_active, ct.code into v_type_active, v_type_code
  from public.rental_charge_types ct
  where ct.id = p_charge_type_id;
  if not found then
    raise exception 'Choose a charge type.' using errcode = '22023';
  end if;
  if not v_type_active then
    raise exception 'That charge type is archived. Choose another.' using errcode = '22023';
  end if;
  if v_type_code = 'bill_adjustment' then
    raise exception 'Use Adjust bill for corrections.' using errcode = '22023';
  end if;

  select r.status into v_status
  from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cancelled rentals cannot take new charges.' using errcode = 'check_violation';
  end if;

  insert into public.payments (
    rental_id, payment_type, charge_type_id, amount, currency, method,
    status, notes, submitted_at, confirmed_at, confirmed_by
  )
  values (
    p_rental_id, 'penalty', p_charge_type_id, round(p_amount, 2), 'PHP', null,
    'confirmed', nullif(btrim(coalesce(p_notes, '')), ''), now(), now(), v_user_id
  )
  returning id into v_payment_id;

  if coalesce(p_cost, 0) > 0 then
    perform private.set_charge_cost(v_payment_id, p_cost);
  end if;

  perform private.refresh_rental_payment_summary(p_rental_id);
  return v_payment_id;
end;
$$;

revoke all on function public.add_rental_charge(uuid, uuid, numeric, text, numeric) from public, anon;
grant execute on function public.add_rental_charge(uuid, uuid, numeric, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Setting or clearing a charge's cost later
-- ---------------------------------------------------------------------------
create or replace function public.set_rental_charge_cost(p_payment_id uuid, p_cost numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can record what a charge cost.' using errcode = '42501';
  end if;
  return private.set_charge_cost(p_payment_id, p_cost);
end;
$$;

revoke all on function public.set_rental_charge_cost(uuid, numeric) from public, anon;
grant execute on function public.set_rental_charge_cost(uuid, numeric) to authenticated, service_role;

comment on function public.set_rental_charge_cost(uuid, numeric) is
  'Owner/admin: set what a bill charge cost the business. 0 or null voids the cost. Writes the linked finance expense.';

-- ---------------------------------------------------------------------------
-- 6. Removing a charge removes its cost
-- ---------------------------------------------------------------------------
create or replace function public.void_rental_charge(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental_id uuid;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can remove charges.' using errcode = '42501';
  end if;

  update public.payments p
  set status = 'cancelled'
  where p.id = p_payment_id
    and p.payment_type = 'penalty'
    and p.status = 'confirmed'
  returning p.rental_id into v_rental_id;

  if v_rental_id is null then
    raise exception 'That charge was not found or is already removed.' using errcode = 'P0002';
  end if;

  update public.expenses e
  set status = 'void'
  where e.charge_payment_id = p_payment_id
    and e.status = 'recorded';

  perform private.refresh_rental_payment_summary(v_rental_id);
end;
$$;

revoke all on function public.void_rental_charge(uuid) from public, anon;
grant execute on function public.void_rental_charge(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Reading a rental's charge costs (owners and admins)
-- ---------------------------------------------------------------------------
create or replace function public.list_rental_charge_costs(p_rental_id uuid)
returns table (payment_id uuid, expense_id uuid, cost numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.charge_payment_id, e.id, e.gross_amount
  from public.expenses e
  where (select private.is_org_admin())
    and e.rental_id = p_rental_id
    and e.charge_payment_id is not null
    and e.status = 'recorded';
$$;

revoke all on function public.list_rental_charge_costs(uuid) from public, anon;
grant execute on function public.list_rental_charge_costs(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. The expense ledger names the rental a cost came from
--    `e.*` was expanded when the view was made, so it is rebuilt.
-- ---------------------------------------------------------------------------
drop view if exists public.expense_ledger;

create view public.expense_ledger
with (security_invoker = true)
as
select
  e.*,
  c.name as category_name,
  c.bir_line,
  v.plate_number as vehicle_plate,
  r.reference_number as rental_reference
from public.expenses e
join public.expense_categories c on c.id = e.category_id
left join public.vehicles v on v.id = e.vehicle_id
left join public.rentals r on r.id = e.rental_id;

revoke all on public.expense_ledger from anon, authenticated;
grant select on public.expense_ledger to authenticated;
grant select on public.expense_ledger to service_role;
