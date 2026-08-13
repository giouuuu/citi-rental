-- Drivers roster for the with-driver rental offering.
--
-- Mirrors the customers table's org-scoping, RLS, and grant shape. Status is
-- OPERATIONAL only (available / on_leave / inactive) — the same rule as
-- vehicles.status. Whether a driver is booked on a given day comes from rental
-- date ranges once drivers are attached to rentals, never from tagging this row.

create type public.driver_status as enum (
  'available',
  'on_leave',
  'inactive'
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  phone_number text not null check (char_length(trim(phone_number)) between 1 and 40),
  email text check (email is null or char_length(trim(email)) <= 160),
  address text check (address is null or char_length(address) <= 500),
  drivers_license_number text not null
    check (char_length(trim(drivers_license_number)) between 1 and 80),
  drivers_license_expires_at date,
  license_type text check (license_type is null or char_length(trim(license_type)) <= 60),
  emergency_contact_name text
    check (emergency_contact_name is null or char_length(trim(emergency_contact_name)) <= 120),
  emergency_contact_number text
    check (emergency_contact_number is null or char_length(trim(emergency_contact_number)) <= 40),
  daily_rate numeric(12, 2) check (daily_rate is null or daily_rate >= 0),
  hired_at date,
  status public.driver_status not null default 'available',
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key so a future rentals.driver_id FK can enforce same-tenant.
  constraint drivers_organization_id_id_key unique (organization_id, id)
);

create unique index drivers_org_license_unique
  on public.drivers (organization_id, lower(trim(drivers_license_number)));

create index drivers_org_name_idx
  on public.drivers (organization_id, lower(full_name));

create index drivers_org_status_idx
  on public.drivers (organization_id, status);

create trigger drivers_set_updated_at
before update on public.drivers
for each row execute function private.set_updated_at();

comment on table public.drivers is
  'Drivers available for with-driver rentals. Status is operational only.';

-- ---------------------------------------------------------------------------
-- RLS + grants (matches the customers/rentals staff-managed shape)
-- ---------------------------------------------------------------------------

alter table public.drivers enable row level security;
alter table public.drivers force row level security;

revoke all on table public.drivers from anon, authenticated;
grant select, insert, update, delete on table public.drivers to authenticated;
grant all on table public.drivers to service_role;

grant usage on type public.driver_status to authenticated, service_role;

create policy drivers_select_organization
on public.drivers
for select
to authenticated
using (organization_id = (select private.current_organization_id()));

create policy drivers_write_staff
on public.drivers
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
