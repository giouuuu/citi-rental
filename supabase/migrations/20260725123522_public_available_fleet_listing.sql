-- Allow marketing landing pages to list available fleet vehicles for
-- organizations that opt into public listing. Only non-sensitive columns
-- are returned; plate numbers and notes stay private.

alter table public.organizations
  add column if not exists show_on_public_site boolean not null default false;

comment on column public.organizations.show_on_public_site is
  'When true, available vehicles from this organization appear on the public landing fleet.';

-- Enable public listing for existing active organizations (single-tenant landing).
update public.organizations
set show_on_public_site = true
where is_active;

create or replace function public.list_public_available_vehicles()
returns table (
  id uuid,
  name text,
  make text,
  model text,
  year smallint,
  category text,
  transmission public.vehicle_transmission,
  fuel_type public.vehicle_fuel_type,
  seating_capacity smallint,
  photo_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.name,
    v.make,
    v.model,
    v.year,
    v.category,
    v.transmission,
    v.fuel_type,
    v.seating_capacity,
    v.photo_url
  from public.vehicles v
  inner join public.organizations o
    on o.id = v.organization_id
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
  order by v.name asc, v.created_at asc;
$$;

revoke all on function public.list_public_available_vehicles()
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_available_vehicles()
  to anon, authenticated;

comment on function public.list_public_available_vehicles() is
  'Public catalog of available vehicles for organizations with show_on_public_site enabled.';
