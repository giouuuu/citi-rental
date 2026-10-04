-- Landing-page showcase image per vehicle.
--
-- The public hero lets customers flip through the fleet: each car is a
-- front-view cutout (transparent background) standing on the hero's road.
-- That image is separate from the 6-angle gallery: it is optional, not part of
-- the "available" gate, and only cars that have one appear in the hero.
-- The storefront also shows the car's colour now, so both public RPCs return
-- `color` and `showcase_image_url`.

alter table public.vehicles
  add column showcase_image_url text;

comment on column public.vehicles.showcase_image_url is
  'Public URL of a front-view, transparent-background cutout shown in the landing-page hero. Optional.';

-- ---------------------------------------------------------------------------
-- vehicle_list expands `v.*` at creation, so recreate it to pick up the column.
-- ---------------------------------------------------------------------------
drop view public.vehicle_list;

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
-- Public storefront RPCs. `returns table` cannot change shape in place.
-- ---------------------------------------------------------------------------
drop function if exists public.list_public_available_vehicles(date, date);
drop function if exists public.get_public_vehicle(uuid);

create function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric,
  color text, showcase_image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate,
    v.color, v.showcase_image_url
  from public.vehicles v
  cross join public.company_profile o
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
        where r.vehicle_id = v.id
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

create function public.get_public_vehicle(p_vehicle_id uuid)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, status public.vehicle_status,
  daily_rate numeric, color text, showcase_image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category, v.transmission,
    v.fuel_type, v.seating_capacity, v.photo_url, v.status, v.daily_rate,
    v.color, v.showcase_image_url
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

revoke all on function public.list_public_available_vehicles(date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_available_vehicles(date, date)
  to anon, authenticated;

revoke all on function public.get_public_vehicle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_vehicle(uuid)
  to anon, authenticated;
