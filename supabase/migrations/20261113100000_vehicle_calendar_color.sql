-- ---------------------------------------------------------------------------
-- A colour per car for the fleet booking calendar, so staff spot a car's
-- bookings at a glance. Picked on the vehicle form's colour wheel and stored
-- as lowercase #rrggbb. Null: the calendar gives the car a stable colour from
-- its own palette (src/features/vehicles/lib/calendar-color.ts).
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column calendar_color text
  constraint vehicles_calendar_color_hex check (calendar_color ~ '^#[0-9a-f]{6}$');

comment on column public.vehicles.calendar_color is
  'Fleet calendar colour for this car, #rrggbb. Null: a palette colour is assigned in the app.';

-- vehicle_list lists its columns; append the new one so the view can be
-- replaced in place and keeps its grants.
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
  v.hourly_rate,
  v.calendar_color
from public.vehicles v
left join (
  select
    d.vehicle_id,
    case max(d.urgency) when 2 then 'overdue' when 1 then 'due_soon' else 'on_schedule' end as service_status,
    count(*) filter (where d.status <> 'on_schedule') as services_due
  from public.vehicle_maintenance_due d
  group by d.vehicle_id
) s on s.vehicle_id = v.id;
