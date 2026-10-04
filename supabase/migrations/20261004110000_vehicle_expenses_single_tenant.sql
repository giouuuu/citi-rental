-- ===========================================================================
-- vehicle_expenses: drop the organization dimension ahead of the single-tenant
-- migration (20261004120000).
--
-- The expense ledger (20260814090000) was written on main while the
-- single-tenant branch was open, so that migration doesn't know about it. Its
-- policies call private.current_organization_id(), which 20261004120000 drops
-- without CASCADE, and its composite FKs lean on the (organization_id, id)
-- uniques that migration removes. Converting the table first lets the
-- single-tenant migration run unchanged.
--
-- Same treatment as every other table there:
--   * policies keep their role test and lose the tenant test,
--   * composite tenant FKs become plain FKs with the same ON DELETE,
--   * org-leading indexes are rebuilt without the column,
--   * receipt storage policies stop reading the tenant path segment.
--     Existing objects keep their `<org-uuid>/<vehicle-id>/...` names and stay
--     readable; new uploads write `<vehicle-id>/...`.
-- ===========================================================================

-- Policies -------------------------------------------------------------------
drop policy if exists vehicle_expenses_select_organization on public.vehicle_expenses;
drop policy if exists vehicle_expenses_write_staff on public.vehicle_expenses;

-- Reads were open to every member of the organization, customers included;
-- the ledger is staff-only data, like the 20260929100000 business tables.
create policy vehicle_expenses_select_staff
on public.vehicle_expenses
for select
to authenticated
using ((select private.is_org_staff()));

create policy vehicle_expenses_write_staff
on public.vehicle_expenses
for all
to authenticated
using ((select private.is_org_staff()))
with check ((select private.is_org_staff()));

-- Foreign keys ---------------------------------------------------------------
alter table public.vehicle_expenses
  drop constraint if exists vehicle_expenses_vehicle_tenant_fkey,
  drop constraint if exists vehicle_expenses_rental_tenant_fkey,
  drop constraint if exists vehicle_expenses_organization_id_id_key;

alter table public.vehicle_expenses
  add constraint vehicle_expenses_vehicle_fkey
    foreign key (vehicle_id) references public.vehicles (id) on delete cascade,
  add constraint vehicle_expenses_rental_fkey
    foreign key (rental_id) references public.rentals (id) on delete set null;

-- Indexes --------------------------------------------------------------------
drop index if exists public.vehicle_expenses_org_vehicle_date_idx;
drop index if exists public.vehicle_expenses_org_date_idx;

create index vehicle_expenses_vehicle_date_idx
  on public.vehicle_expenses (vehicle_id, incurred_on desc);

create index vehicle_expenses_date_idx
  on public.vehicle_expenses (incurred_on desc);

create index vehicle_expenses_rental_id_idx
  on public.vehicle_expenses (rental_id)
  where rental_id is not null;

-- Column ---------------------------------------------------------------------
alter table public.vehicle_expenses drop column organization_id;

comment on column public.vehicle_expenses.receipt_path is
  'Storage object path in the private expense-receipts bucket: <vehicle-id>/<file> (older rows: <org-id>/<vehicle-id>/<file>).';

-- Receipt storage --------------------------------------------------------------
drop policy if exists "expense_receipts_select_staff" on storage.objects;
create policy "expense_receipts_select_staff"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (select private.is_org_staff())
);

drop policy if exists "expense_receipts_insert_staff" on storage.objects;
create policy "expense_receipts_insert_staff"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (select private.is_org_staff())
);

drop policy if exists "expense_receipts_delete_admin" on storage.objects;
create policy "expense_receipts_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (select private.current_app_role()) in ('owner', 'admin')
);
