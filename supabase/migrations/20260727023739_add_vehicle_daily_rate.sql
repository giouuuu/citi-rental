-- Daily rental rate on fleet vehicles (PHP). Seed existing cars at 2000.

alter table public.vehicles
  add column if not exists daily_rate numeric(12, 2);

update public.vehicles
set daily_rate = 2000
where daily_rate is null;

alter table public.vehicles
  alter column daily_rate set default 2000,
  alter column daily_rate set not null;

alter table public.vehicles
  drop constraint if exists vehicles_daily_rate_positive;

alter table public.vehicles
  add constraint vehicles_daily_rate_positive
  check (daily_rate > 0);

comment on column public.vehicles.daily_rate is
  'Base daily rental rate in PHP for public quotes and ops display.';

-- Recreate public fleet RPCs to expose daily_rate.
drop function if exists public.list_public_available_vehicles(date, date);
drop function if exists public.get_public_vehicle(uuid);

create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
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
  photo_url text,
  daily_rate numeric
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
    v.photo_url,
    v.daily_rate
  from public.vehicles v
  inner join public.organizations o
    on o.id = v.organization_id
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
    and (
      p_start_date is null
      or p_end_date is null
      or p_end_date < p_start_date
      or not exists (
        select 1
        from public.rentals r
        where r.organization_id = v.organization_id
          and r.vehicle_id = v.id
          and r.status in ('reserved', 'active', 'overdue')
          and tstzrange(r.start_at, r.expected_return_at, '[)')
            && tstzrange(
              (p_start_date::timestamp at time zone 'Asia/Manila'),
              ((p_end_date + 1)::timestamp at time zone 'Asia/Manila'),
              '[)'
            )
      )
    )
  order by v.name asc, v.created_at asc;
$$;

revoke all on function public.list_public_available_vehicles(date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_available_vehicles(date, date)
  to anon, authenticated;

comment on function public.list_public_available_vehicles(date, date) is
  'Public catalog of available vehicles; optional dates exclude schedule conflicts.';

create or replace function public.get_public_vehicle(p_vehicle_id uuid)
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
  photo_url text,
  status public.vehicle_status,
  daily_rate numeric
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
    v.photo_url,
    v.status,
    v.daily_rate
  from public.vehicles v
  inner join public.organizations o on o.id = v.organization_id
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

revoke all on function public.get_public_vehicle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_vehicle(uuid)
  to anon, authenticated;

comment on function public.get_public_vehicle(uuid) is
  'Public vehicle detail for booking; excludes inactive and private fleet orgs.';
