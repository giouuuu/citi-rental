-- ===========================================================================
-- Vehicle maintenance: service plans per car, a record of every service, and
-- its cost booked as that car's expense.
--
-- A plan says how often the work is due: every N km, every N months, or both
-- (whichever comes first). It starts from the date and odometer the work was
-- last done before the plan was entered; each recorded service after that
-- takes over as "last done". Due status is computed on read by the
-- vehicle_maintenance_due view, never stored.
--
-- Owners and admins run maintenance from the vehicle page. Recording a service
-- with a cost writes two rows atomically: the service record (for the car's
-- history and the next due date) and a vehicle-tagged Repairs and maintenance
-- expense (for the statement and per-vehicle margin). Expenses are owner-only,
-- so the record/void RPCs run as security definer behind an owner/admin check.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. vehicle_maintenance_plans
-- ---------------------------------------------------------------------------
create table public.vehicle_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  interval_km integer check (interval_km is null or interval_km between 100 and 200000),
  interval_months integer check (interval_months is null or interval_months between 1 and 120),
  -- When the work was last done before this plan was entered. Service records
  -- dated after it take over as "last done".
  baseline_done_on date not null,
  baseline_odometer numeric(12, 1) check (baseline_odometer is null or baseline_odometer >= 0),
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_maintenance_plans_has_interval
    check (interval_km is not null or interval_months is not null),
  constraint vehicle_maintenance_plans_km_needs_odometer
    check (interval_km is null or baseline_odometer is not null)
);

create index vehicle_maintenance_plans_vehicle_id_idx on public.vehicle_maintenance_plans (vehicle_id);
create index vehicle_maintenance_plans_created_by_idx on public.vehicle_maintenance_plans (created_by);
-- One live "Oil change" per car; archived plans stay as history.
create unique index vehicle_maintenance_plans_one_name_per_vehicle
  on public.vehicle_maintenance_plans (vehicle_id, lower(trim(name))) where is_active;

create trigger vehicle_maintenance_plans_set_updated_at
before update on public.vehicle_maintenance_plans
for each row execute function private.set_updated_at();

comment on table public.vehicle_maintenance_plans is
  'Recurring service per car (every N km and/or N months). Due status comes from vehicle_maintenance_due.';

-- ---------------------------------------------------------------------------
-- 2. vehicle_maintenance_records
-- ---------------------------------------------------------------------------
create table public.vehicle_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  -- Null for a one-off repair that is not on a schedule.
  plan_id uuid references public.vehicle_maintenance_plans (id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  performed_on date not null,
  odometer numeric(12, 1) check (odometer is null or odometer >= 0),
  -- What was paid, VAT included. Zero for free or warranty work.
  cost numeric(12, 2) not null check (cost >= 0),
  shop_name text check (shop_name is null or char_length(trim(shop_name)) between 1 and 200),
  document_number text check (document_number is null or char_length(trim(document_number)) between 1 and 80),
  payment_method text check (payment_method in ('cash', 'bank', 'gcash', 'maya', 'check', 'other')),
  -- The expense this service posted (null when the cost was zero).
  expense_id uuid references public.expenses (id) on delete set null,
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_maintenance_records_vehicle_id_idx
  on public.vehicle_maintenance_records (vehicle_id, performed_on desc);
create index vehicle_maintenance_records_plan_id_idx
  on public.vehicle_maintenance_records (plan_id) where plan_id is not null;
create index vehicle_maintenance_records_expense_id_idx
  on public.vehicle_maintenance_records (expense_id) where expense_id is not null;
create index vehicle_maintenance_records_created_by_idx
  on public.vehicle_maintenance_records (created_by);

create trigger vehicle_maintenance_records_set_updated_at
before update on public.vehicle_maintenance_records
for each row execute function private.set_updated_at();

comment on table public.vehicle_maintenance_records is
  'Every service done on a car. Written only through record_vehicle_maintenance.';

-- ---------------------------------------------------------------------------
-- 3. RLS: owner and admin. Plans are edited directly; records only through
--    the RPCs, because they also write the owner-only expense ledger.
-- ---------------------------------------------------------------------------
alter table public.vehicle_maintenance_plans enable row level security;
alter table public.vehicle_maintenance_records enable row level security;

revoke all on table public.vehicle_maintenance_plans, public.vehicle_maintenance_records
  from anon, authenticated;
grant select, insert, update on table public.vehicle_maintenance_plans to authenticated;
grant select on table public.vehicle_maintenance_records to authenticated;
grant all on table public.vehicle_maintenance_plans, public.vehicle_maintenance_records to service_role;

create policy vehicle_maintenance_plans_select_admin
on public.vehicle_maintenance_plans for select to authenticated
using ((select private.is_org_admin()));

create policy vehicle_maintenance_plans_insert_admin
on public.vehicle_maintenance_plans for insert to authenticated
with check ((select private.is_org_admin()));

create policy vehicle_maintenance_plans_update_admin
on public.vehicle_maintenance_plans for update to authenticated
using ((select private.is_org_admin()))
with check ((select private.is_org_admin()));

create policy vehicle_maintenance_records_select_admin
on public.vehicle_maintenance_records for select to authenticated
using ((select private.is_org_admin()));

-- ---------------------------------------------------------------------------
-- 4. vehicle_maintenance_due: every active plan with its due point and status.
--    The one place due status is computed; the vehicle tab, the fleet
--    Maintenance page, the dashboard and the Vehicles list all read it.
--
--    Last done: the newest recorded service on the plan, unless it predates
--    the plan's starting point. Due at whichever comes first: last odometer
--    + interval_km, or last date + interval_months (Postgres clamps Aug 31 +
--    6 months to Feb 28). "Due soon" within 1,000 km / 30 days, shortened to
--    20% of the km interval / 7 days per month for short intervals.
-- ---------------------------------------------------------------------------
create view public.vehicle_maintenance_due
with (security_invoker = true)
as
with last_service as (
  select distinct on (r.plan_id)
    r.plan_id,
    r.performed_on,
    r.odometer
  from public.vehicle_maintenance_records r
  where r.status = 'recorded'
    and r.plan_id is not null
  order by r.plan_id, r.performed_on desc, r.odometer desc nulls last, r.created_at desc
),
pointed as (
  select
    p.*,
    v.plate_number,
    v.name as vehicle_name,
    v.status as vehicle_status,
    v.current_odometer,
    coalesce(l.performed_on >= p.baseline_done_on, false) as from_record,
    l.performed_on as record_done_on,
    l.odometer as record_odometer,
    (now() at time zone 'Asia/Manila')::date as today
  from public.vehicle_maintenance_plans p
  join public.vehicles v on v.id = p.vehicle_id
  left join last_service l on l.plan_id = p.id
  where p.is_active
),
due as (
  select
    pt.*,
    case when pt.from_record then pt.record_done_on else pt.baseline_done_on end as last_done_on,
    -- A record without a reading keeps counting km from the starting point.
    case when pt.from_record then coalesce(pt.record_odometer, pt.baseline_odometer)
         else pt.baseline_odometer end as last_odometer
  from pointed pt
),
measured as (
  select
    d.*,
    case when d.interval_months is not null
      then (d.last_done_on + make_interval(months => d.interval_months))::date end as next_due_on,
    case when d.interval_km is not null and d.last_odometer is not null
      then d.last_odometer + d.interval_km end as next_due_km
  from due d
),
gapped as (
  select
    m.*,
    m.next_due_on - m.today as days_left,
    case when m.next_due_km is not null and m.current_odometer is not null
      then round(m.next_due_km - m.current_odometer)::integer end as km_left
  from measured m
),
judged as (
  select
    g.*,
    case
      when g.days_left < 0 or g.km_left <= 0 then 'overdue'
      when g.days_left <= least(30, g.interval_months * 7)
        or g.km_left <= least(1000, round(g.interval_km * 0.2)) then 'due_soon'
      else 'on_schedule'
    end as status
  from gapped g
)
select
  j.id,
  j.vehicle_id,
  j.plate_number,
  j.vehicle_name,
  j.vehicle_status,
  j.current_odometer,
  j.name,
  j.interval_km,
  j.interval_months,
  j.baseline_done_on,
  j.baseline_odometer,
  j.is_active,
  j.notes,
  j.last_done_on,
  j.last_odometer,
  j.from_record,
  j.next_due_on,
  j.next_due_km,
  j.days_left,
  j.km_left,
  j.status,
  -- Higher is more urgent, so the default descending sort puts overdue first.
  case j.status when 'overdue' then 2 when 'due_soon' then 1 else 0 end as urgency,
  concat_ws(' ', j.plate_number, j.vehicle_name, j.name) as search_text
from judged j;

revoke all on public.vehicle_maintenance_due from anon, authenticated;
grant select on public.vehicle_maintenance_due to authenticated, service_role;

comment on view public.vehicle_maintenance_due is
  'Active maintenance plans with last done, next due (km/date) and status: overdue, due_soon or on_schedule.';

-- ---------------------------------------------------------------------------
-- 5. vehicle_list: the ops Vehicles table, with each car's worst service
--    status. Reads only; writes still go to public.vehicles.
--    `v.*` is expanded when the view is created: a migration that adds a
--    vehicles column must recreate this view to list it.
-- ---------------------------------------------------------------------------
create view public.vehicle_list
with (security_invoker = true)
as
select
  v.*,
  coalesce(s.service_status, 'no_schedule') as service_status,
  coalesce(s.services_due, 0) as services_due
from public.vehicles v
left join (
  select
    d.vehicle_id,
    case max(d.urgency) when 2 then 'overdue' when 1 then 'due_soon' else 'on_schedule' end as service_status,
    count(*) filter (where d.status <> 'on_schedule') as services_due
  from public.vehicle_maintenance_due d
  group by d.vehicle_id
) s on s.vehicle_id = v.id;

revoke all on public.vehicle_list from anon, authenticated;
grant select on public.vehicle_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. record_vehicle_maintenance: service record + vehicle expense, atomically.
-- ---------------------------------------------------------------------------
create or replace function public.record_vehicle_maintenance(
  p_vehicle_id uuid,
  p_plan_id uuid,
  p_title text,
  p_performed_on date,
  p_odometer numeric,
  p_cost numeric,
  p_category_code text default 'repairs_labor',
  p_shop_name text default null,
  p_document_type text default null,
  p_document_number text default null,
  p_input_vat numeric default 0,
  p_payment_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_plan public.vehicle_maintenance_plans%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_shop text := nullif(trim(coalesce(p_shop_name, '')), '');
  v_document text := nullif(trim(coalesce(p_document_number, '')), '');
  v_document_type text;
  v_input_vat numeric := coalesce(p_input_vat, 0);
  v_category uuid;
  v_expense uuid;
  v_record uuid;
begin
  if not private.is_org_admin() then
    raise exception 'Only owners and admins can record maintenance.' using errcode = '42501';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'The vehicle was not found.' using errcode = 'P0002';
  end if;

  if p_plan_id is not null then
    select * into v_plan
    from public.vehicle_maintenance_plans
    where id = p_plan_id and vehicle_id = p_vehicle_id;
    if not found then
      raise exception 'That maintenance plan is not on this vehicle.' using errcode = 'P0002';
    end if;
    if not v_plan.is_active then
      raise exception 'That maintenance plan is archived.' using errcode = '22023';
    end if;
    v_title := coalesce(v_title, v_plan.name);
    if v_plan.interval_km is not null and p_odometer is null then
      raise exception 'Enter the odometer reading. This service is due by kilometres.' using errcode = '22023';
    end if;
  end if;

  if v_title is null or char_length(v_title) > 160 then
    raise exception 'Describe the work done (up to 160 characters).' using errcode = '22023';
  end if;
  if p_performed_on is null then
    raise exception 'A service date is required.' using errcode = '22023';
  end if;
  if p_performed_on > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The service date cannot be in the future.' using errcode = '22023';
  end if;
  if p_odometer is not null and p_odometer < 0 then
    raise exception 'The odometer reading cannot be negative.' using errcode = '22023';
  end if;
  if p_cost is null or p_cost < 0 then
    raise exception 'Enter the cost, or 0 for free work.' using errcode = '22023';
  end if;
  if coalesce(p_category_code, '') not in ('repairs_labor', 'repairs_materials') then
    raise exception 'Choose labor or materials for the expense line.' using errcode = '22023';
  end if;

  v_document_type := coalesce(
    nullif(trim(coalesce(p_document_type, '')), ''),
    case when v_document is null then 'none' else 'non_vat_invoice' end
  );
  if v_document_type not in ('vat_invoice', 'non_vat_invoice', 'official_receipt', 'acknowledgement_receipt', 'none') then
    raise exception 'That receipt type is not recognised.' using errcode = '22023';
  end if;
  -- Only a VAT invoice carries creditable input VAT.
  if v_document_type <> 'vat_invoice' then
    v_input_vat := 0;
  end if;
  if v_input_vat < 0 or (p_cost > 0 and v_input_vat >= p_cost) then
    raise exception 'The VAT must be less than the amount paid.' using errcode = '22023';
  end if;

  if p_cost > 0 then
    select c.id into v_category
    from public.expense_categories c
    where c.code = p_category_code;
    if v_category is null then
      raise exception 'The Repairs and maintenance expense line is missing.' using errcode = 'P0002';
    end if;

    insert into public.expenses (
      expense_date, category_id, vehicle_id, description, supplier_name,
      supplier_vat_registered, document_type, document_number,
      gross_amount, input_vat, payment_method, notes
    )
    values (
      p_performed_on,
      v_category,
      p_vehicle_id,
      left(
        concat_ws(' · ',
          v_title,
          v_vehicle.plate_number,
          case when p_odometer is not null then to_char(p_odometer, 'FM999,999,990') || ' km' end),
        300),
      v_shop,
      v_document_type = 'vat_invoice',
      v_document_type,
      v_document,
      round(p_cost, 2),
      round(v_input_vat, 2),
      p_payment_method,
      'Posted from vehicle maintenance.'
    )
    returning id into v_expense;
  end if;

  insert into public.vehicle_maintenance_records (
    vehicle_id, plan_id, title, performed_on, odometer, cost,
    shop_name, document_number, payment_method, expense_id, notes
  )
  values (
    p_vehicle_id, p_plan_id, v_title, p_performed_on, p_odometer, round(p_cost, 2),
    v_shop, v_document, p_payment_method, v_expense, nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_record;

  -- A service reading ahead of the car's last known odometer is the new truth.
  if p_odometer is not null and p_odometer > coalesce(v_vehicle.current_odometer, 0) then
    update public.vehicles set current_odometer = p_odometer where id = p_vehicle_id;
  end if;

  return v_record;
end;
$$;

revoke all on function public.record_vehicle_maintenance(
  uuid, uuid, text, date, numeric, numeric, text, text, text, text, numeric, text, text
) from public, anon;
grant execute on function public.record_vehicle_maintenance(
  uuid, uuid, text, date, numeric, numeric, text, text, text, text, numeric, text, text
) to authenticated;

comment on function public.record_vehicle_maintenance(
  uuid, uuid, text, date, numeric, numeric, text, text, text, text, numeric, text, text
) is
  'Owner/admin. Records one service and posts its cost as a vehicle-tagged Repairs and maintenance expense.';

-- ---------------------------------------------------------------------------
-- 7. void_vehicle_maintenance: undo a mistaken entry and its expense.
--    The odometer is left alone; the reading was still seen.
-- ---------------------------------------------------------------------------
create or replace function public.void_vehicle_maintenance(p_record_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record public.vehicle_maintenance_records%rowtype;
begin
  if not private.is_org_admin() then
    raise exception 'Only owners and admins can void maintenance.' using errcode = '42501';
  end if;

  select * into v_record
  from public.vehicle_maintenance_records
  where id = p_record_id and status = 'recorded'
  for update;
  if not found then
    raise exception 'The service record was not found.' using errcode = 'P0002';
  end if;

  update public.vehicle_maintenance_records set status = 'void' where id = p_record_id;
  if v_record.expense_id is not null then
    update public.expenses set status = 'void' where id = v_record.expense_id;
  end if;
end;
$$;

revoke all on function public.void_vehicle_maintenance(uuid) from public, anon;
grant execute on function public.void_vehicle_maintenance(uuid) to authenticated;
