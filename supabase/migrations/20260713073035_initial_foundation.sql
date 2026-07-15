create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('administrator', 'rental_staff', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'Asia/Manila',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role public.app_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_active_organization_idx
  on public.profiles (organization_id, role)
  where is_active = true;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles from anon, authenticated;

grant select, update on public.organizations to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.organizations to service_role;
grant all on public.profiles to service_role;

grant execute on function private.current_organization_id() to authenticated, service_role;
grant execute on function private.current_app_role() to authenticated, service_role;

create policy organizations_select_own
on public.organizations
for select
to authenticated
using (id = (select private.current_organization_id()));

create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (
  id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
)
with check (
  id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);

create policy profiles_select_organization
on public.profiles
for select
to authenticated
using (organization_id = (select private.current_organization_id()));

create policy profiles_insert_admin
on public.profiles
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);

comment on table public.organizations is 'Tenant boundary for rental businesses.';
comment on table public.profiles is 'Application authorization profile linked to Supabase Auth.';
comment on column public.profiles.role is 'Database-enforced application role; never sourced from user metadata.';
