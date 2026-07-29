-- Public booked date ranges for a vehicle (calendar greying on booking form).
-- Only reserved/active/overdue — same statuses as private.rental_schedule_conflict.

create or replace function public.list_public_vehicle_booked_ranges(
  p_vehicle_id uuid
)
returns table (
  start_at timestamptz,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.start_at,
    r.expected_return_at
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  inner join public.organizations o on o.id = v.organization_id
  where r.vehicle_id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive'
    and r.status in ('reserved', 'active', 'overdue')
    and r.expected_return_at > now()
  order by r.start_at asc;
$$;

revoke all on function public.list_public_vehicle_booked_ranges(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_vehicle_booked_ranges(uuid)
  to anon, authenticated;

comment on function public.list_public_vehicle_booked_ranges(uuid) is
  'Public booked intervals for a fleet vehicle calendar; no customer or reference details.';
