-- ===========================================================================
-- Costs on every line of a rental's bill, and expenses tagged to a rental.
--
-- 20261011090000_rental_charge_costs let owners and admins enter what a
-- charge cost (Delivery ₱500 billed, ₱300 paid to the driver). Online
-- bookings now bill delivery as the pick-up/return legs and the car wash as a
-- booking fee, which are not charges, so they had no way to carry a cost.
-- The money billed stays income; the cost is an expense in Finance, so the
-- two cancel out on the statement.
--
-- 1. expenses.rental_line names the bill line a cost belongs to: 'pickup',
--    'return' (delivery / collection) or 'fee:<charge_type_id>' (a booking
--    fee such as Car wash). One recorded cost per line.
-- 2. An expense tagged to a rental gets that rental's car when none is set,
--    and a cost entered from a rental's bill keeps its rental.
-- 3. set_rental_line_cost adds, changes, or clears a line's cost.
-- 4. list_rental_costs: every recorded expense on a rental, for owners and
--    admins, and whether the viewer can open Finance.
-- 5. rental_expense_options: rentals labelled for the Finance expense form's
--    Rental picker ("ZCR-0012" · customer · plate · start date).
--
-- list_rental_charge_costs is left in place for the app deployed before this.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Which bill line a cost belongs to
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists rental_line text
    check (
      rental_line is null
      or rental_line in ('pickup', 'return')
      or rental_line ~ '^fee:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );

comment on column public.expenses.rental_line is
  'The rental bill line this is the cost of: pickup, return (delivery legs) or fee:<charge_type_id> (a booking fee). Null for charge costs and costs tagged from Finance.';

create unique index if not exists expenses_one_recorded_cost_per_rental_line
  on public.expenses (rental_id, rental_line)
  where rental_line is not null and status = 'recorded';

-- ---------------------------------------------------------------------------
-- 2. Tagging an expense to a rental
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
    and (old.charge_payment_id is not null or old.rental_line is not null)
    and new.rental_id is distinct from old.rental_id
    and exists (select 1 from public.rentals r where r.id = old.rental_id) then
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

revoke all on function private.expenses_follow_rental() from public, anon, authenticated;

drop trigger if exists expenses_follow_rental on public.expenses;
create trigger expenses_follow_rental
before insert or update of rental_id, vehicle_id on public.expenses
for each row execute function private.expenses_follow_rental();

-- ---------------------------------------------------------------------------
-- 3. Setting a bill line's cost
-- ---------------------------------------------------------------------------
create or replace function public.set_rental_line_cost(
  p_rental_id uuid,
  p_line text,
  p_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric(12, 2) := round(coalesce(p_cost, 0), 2);
  v_rental record;
  v_fee jsonb;
  v_fee_type_id uuid;
  v_line_name text;
  v_category_id uuid;
  v_expense_id uuid;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Only owners and admins can record what a charge cost.' using errcode = '42501';
  end if;
  if v_cost < 0 then
    raise exception 'The cost cannot be negative.' using errcode = '22023';
  end if;

  select
    r.id, r.vehicle_id, r.reference_number, r.pickup_method, r.return_method,
    coalesce(r.pickup_delivery_fee, 0) as pickup_fee,
    coalesce(r.return_delivery_fee, 0) as return_fee,
    r.booking_fees
  into v_rental
  from public.rentals r
  where r.id = p_rental_id;
  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  if p_line = 'pickup' then
    if v_rental.pickup_fee <= 0 then
      raise exception 'This rental has no delivery fee on its bill.' using errcode = '22023';
    end if;
    v_line_name := 'Delivery';
  elsif p_line = 'return' then
    if v_rental.return_fee <= 0 then
      raise exception 'This rental has no collection fee on its bill.' using errcode = '22023';
    end if;
    v_line_name := 'Collection';
  elsif p_line ~ '^fee:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_fee_type_id := substr(p_line, 5)::uuid;
    select line into v_fee
    from jsonb_array_elements(coalesce(v_rental.booking_fees, '[]'::jsonb)) as line
    where line ->> 'charge_type_id' = v_fee_type_id::text
    limit 1;
    if v_fee is null then
      raise exception 'That fee is not on this rental''s bill.' using errcode = '22023';
    end if;
    v_line_name := coalesce(nullif(btrim(v_fee ->> 'name'), ''), 'Booking fee');
  else
    raise exception 'Choose a line on the bill.' using errcode = '22023';
  end if;

  select e.id into v_expense_id
  from public.expenses e
  where e.rental_id = p_rental_id
    and e.rental_line = p_line
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

  -- Delivery legs file where the Delivery charge type does; a booking fee
  -- where its own charge type does.
  select ct.expense_category_id into v_category_id
  from public.rental_charge_types ct
  where case
    when v_fee_type_id is not null then ct.id = v_fee_type_id
    else ct.code = 'delivery'
  end;

  v_category_id := coalesce(
    v_category_id,
    case when v_fee_type_id is null then
      (select c.id from public.expense_categories c where c.code = 'transportation_travel')
    end,
    (select c.id from public.expense_categories c where c.code = 'miscellaneous')
  );

  insert into public.expenses (
    expense_date, category_id, vehicle_id, rental_id, rental_line,
    description, document_type, gross_amount
  )
  values (
    (now() at time zone 'Asia/Manila')::date,
    v_category_id,
    v_rental.vehicle_id,
    p_rental_id,
    p_line,
    left(v_line_name || ' · ' || coalesce(v_rental.reference_number, 'rental'), 300),
    'none',
    v_cost
  )
  returning id into v_expense_id;

  return v_expense_id;
end;
$$;

revoke all on function public.set_rental_line_cost(uuid, text, numeric) from public, anon;
grant execute on function public.set_rental_line_cost(uuid, text, numeric) to authenticated, service_role;

comment on function public.set_rental_line_cost(uuid, text, numeric) is
  'Owner/admin: set what a delivery leg (pickup/return) or booking fee (fee:<charge_type_id>) cost the business. 0 voids the cost. Writes the linked finance expense.';

-- ---------------------------------------------------------------------------
-- 4. Every cost on a rental
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

revoke all on function public.list_rental_costs(uuid) from public, anon;
grant execute on function public.list_rental_costs(uuid) to authenticated, service_role;

comment on function public.list_rental_costs(uuid) is
  'Owner/admin: the recorded expenses on one rental (charge costs, delivery and booking-fee costs, and costs tagged from Finance). Null for anyone else.';

-- ---------------------------------------------------------------------------
-- 5. Rentals as the expense form lists them
-- ---------------------------------------------------------------------------
create or replace view public.rental_expense_options
with (security_invoker = true)
as
select
  r.id,
  r.reference_number,
  concat_ws(
    ' · ',
    c.full_name,
    v.plate_number,
    to_char(r.start_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY')
  ) as summary,
  r.start_at,
  r.status
from public.rentals r
join public.customers c on c.id = r.customer_id
join public.vehicles v on v.id = r.vehicle_id;

revoke all on public.rental_expense_options from anon, authenticated;
grant select on public.rental_expense_options to authenticated;
grant select on public.rental_expense_options to service_role;

comment on view public.rental_expense_options is
  'Rentals labelled for pickers: reference number, then customer · plate · start date. RLS of rentals, customers and vehicles applies.';
