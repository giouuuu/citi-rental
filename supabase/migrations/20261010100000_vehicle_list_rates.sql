-- ---------------------------------------------------------------------------
-- vehicle_list expanded `v.*` when it was created, so it missed the 12-hour
-- and hourly rates added by elapsed_time_pricing. Append them; existing
-- columns keep their order, so the view can be replaced in place and keeps
-- its grants.
-- ---------------------------------------------------------------------------
create or replace view public.vehicle_list
with (security_invoker = true)
as
select
  v.id,
  v.plate_number,
  v.name,
  v.make,
  v.model,
  v.year,
  v.color,
  v.category,
  v.transmission,
  v.fuel_type,
  v.seating_capacity,
  v.current_odometer,
  v.status,
  v.photo_url,
  v.notes,
  v.created_at,
  v.updated_at,
  v.daily_rate,
  v.showcase_image_url,
  coalesce(s.service_status, 'no_schedule') as service_status,
  coalesce(s.services_due, 0) as services_due,
  v.half_day_rate,
  v.hourly_rate
from public.vehicles v
left join (
  select
    d.vehicle_id,
    case max(d.urgency) when 2 then 'overdue' when 1 then 'due_soon' else 'on_schedule' end as service_status,
    count(*) filter (where d.status <> 'on_schedule') as services_due
  from public.vehicle_maintenance_due d
  group by d.vehicle_id
) s on s.vehicle_id = v.id;
