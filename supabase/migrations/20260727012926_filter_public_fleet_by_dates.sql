-- Filter public fleet listing by optional trip dates so overlapping
-- reserved/active/overdue rentals hide unavailable cars.

drop function if exists public.list_public_available_vehicles();

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
