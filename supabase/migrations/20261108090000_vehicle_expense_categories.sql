-- ===========================================================================
-- Vehicle expense categories become a list owners and admins maintain.
--
-- The 12 categories were an enum (public.vehicle_expense_category), so adding
-- one meant a migration. They move to public.vehicle_expense_categories, seeded
-- with the same 12, and vehicle_expenses points at a row by category_id.
-- Categories are archived (is_active = false), never deleted: past expenses
-- keep theirs, and the expense form only offers active ones.
-- ===========================================================================

create table public.vehicle_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 100 check (sort_order between 0 and 9999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicle_expense_categories_name_key
  on public.vehicle_expense_categories (lower(trim(name)));

create trigger vehicle_expense_categories_set_updated_at
before update on public.vehicle_expense_categories
for each row execute function private.set_updated_at();

comment on table public.vehicle_expense_categories is
  'Categories a per-vehicle expense is filed under. Archived, never deleted.';

-- Seed from the old enum, keeping its order. `legacy` maps existing rows.
create temporary table vehicle_expense_category_seed (legacy text, name text, sort_order integer) on commit drop;
insert into vehicle_expense_category_seed (legacy, name, sort_order)
values
  ('car_wash', 'Car wash', 10),
  ('fuel', 'Fuel', 20),
  ('repair', 'Repair', 30),
  ('maintenance', 'Maintenance', 40),
  ('tires', 'Tires', 50),
  ('battery', 'Battery', 60),
  ('registration', 'Registration (LTO)', 70),
  ('insurance', 'Insurance', 80),
  ('towing', 'Towing', 90),
  ('parking_tolls', 'Parking & tolls', 100),
  ('accessories', 'Accessories', 110),
  ('other', 'Other', 999);

insert into public.vehicle_expense_categories (name, sort_order)
select name, sort_order from vehicle_expense_category_seed;

-- ---------------------------------------------------------------------------
-- vehicle_expenses.category (enum) → category_id (row)
-- ---------------------------------------------------------------------------
alter table public.vehicle_expenses
  add column category_id uuid references public.vehicle_expense_categories (id) on delete restrict;

update public.vehicle_expenses e
set category_id = c.id
from vehicle_expense_category_seed s
join public.vehicle_expense_categories c on c.name = s.name
where s.legacy = e.category::text;

alter table public.vehicle_expenses alter column category_id set not null;
alter table public.vehicle_expenses drop column category;
drop type public.vehicle_expense_category;

create index vehicle_expenses_category_id_idx on public.vehicle_expenses (category_id);

-- ---------------------------------------------------------------------------
-- RLS: staff read (they record expenses); owners and admins maintain.
-- ---------------------------------------------------------------------------
alter table public.vehicle_expense_categories enable row level security;
alter table public.vehicle_expense_categories force row level security;

revoke all on table public.vehicle_expense_categories from anon, authenticated;
grant select, insert, update on table public.vehicle_expense_categories to authenticated;
grant all on table public.vehicle_expense_categories to service_role;

create policy vehicle_expense_categories_select_staff
on public.vehicle_expense_categories
for select
to authenticated
using ((select private.is_org_staff()));

create policy vehicle_expense_categories_insert_admin
on public.vehicle_expense_categories
for insert
to authenticated
with check ((select private.is_org_admin()));

create policy vehicle_expense_categories_update_admin
on public.vehicle_expense_categories
for update
to authenticated
using ((select private.is_org_admin()))
with check ((select private.is_org_admin()));
