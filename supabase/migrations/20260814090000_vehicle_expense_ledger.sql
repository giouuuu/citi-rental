-- Vehicle expense ledger — phase 1 of vehicle unit economics.
--
-- One row per peso spent on a car (wash, fuel, repair, tires, LTO, insurance…).
-- Mirrors the drivers table's org-scoping/RLS shape and the payments table's
-- composite tenant FK: (organization_id, vehicle_id) references vehicles so an
-- expense can never attach to another org's car. Categories start as a fixed
-- enum by design — promote to an org-editable table only when a real
-- thirteenth category shows up.
--
-- Receipts live in a PRIVATE `expense-receipts` bucket (paths:
-- {organization_id}/{vehicle_id}/{filename}) and are read via signed URLs,
-- the same pattern as payment-proofs.

create type public.vehicle_expense_category as enum (
  'car_wash',
  'fuel',
  'repair',
  'maintenance',
  'tires',
  'battery',
  'registration',
  'insurance',
  'towing',
  'parking_tolls',
  'accessories',
  'other'
);

create table public.vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vehicle_id uuid not null,
  category public.vehicle_expense_category not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'PHP' check (char_length(currency) = 3),
  incurred_on date not null default current_date,
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  vendor text check (vendor is null or char_length(trim(vendor)) <= 120),
  reference text check (reference is null or char_length(trim(reference)) <= 120),
  receipt_path text,
  notes text check (notes is null or char_length(notes) <= 4000),
  -- Optional provenance: the rental that caused this expense (e.g. a repair
  -- after a return). Kept nullable; set null if the rental is deleted so the
  -- cost record survives.
  rental_id uuid,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key so future child tables can enforce same-tenant.
  constraint vehicle_expenses_organization_id_id_key unique (organization_id, id),
  constraint vehicle_expenses_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade,
  constraint vehicle_expenses_rental_tenant_fkey
    foreign key (organization_id, rental_id)
    references public.rentals (organization_id, id) on delete set null
);

-- Org-leading and window-shaped: every ledger/report query filters by
-- organization plus a date range, per-vehicle or fleet-wide.
create index vehicle_expenses_org_vehicle_date_idx
  on public.vehicle_expenses (organization_id, vehicle_id, incurred_on desc);

create index vehicle_expenses_org_date_idx
  on public.vehicle_expenses (organization_id, incurred_on desc);

create trigger vehicle_expenses_set_updated_at
before update on public.vehicle_expenses
for each row execute function private.set_updated_at();

comment on table public.vehicle_expenses is
  'Per-vehicle cost ledger: operating expenses only (no financing, no accounting).';
comment on column public.vehicle_expenses.receipt_path is
  'Storage object path in the private expense-receipts bucket.';

-- ---------------------------------------------------------------------------
-- RLS + grants (matches the customers/rentals/drivers staff-managed shape)
-- ---------------------------------------------------------------------------

alter table public.vehicle_expenses enable row level security;
alter table public.vehicle_expenses force row level security;

revoke all on table public.vehicle_expenses from anon, authenticated;
grant select, insert, update, delete on table public.vehicle_expenses to authenticated;
grant all on table public.vehicle_expenses to service_role;

grant usage on type public.vehicle_expense_category to authenticated, service_role;

create policy vehicle_expenses_select_organization
on public.vehicle_expenses
for select
to authenticated
using (organization_id = (select private.current_organization_id()));

create policy vehicle_expenses_write_staff
on public.vehicle_expenses
for all
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

-- ---------------------------------------------------------------------------
-- Private bucket for expense receipt photos.
-- Unlike payment-proofs there is no anonymous upload: only signed-in staff
-- record expenses, so every policy is org-scoped from the start.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "expense_receipts_select_staff" on storage.objects;
drop policy if exists "expense_receipts_insert_staff" on storage.objects;
drop policy if exists "expense_receipts_delete_admin" on storage.objects;

create policy "expense_receipts_select_staff"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy "expense_receipts_insert_staff"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy "expense_receipts_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin')
);
