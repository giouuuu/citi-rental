-- ===========================================================================
-- The expense forms' Rental picker knows each rental's car.
--
-- Picking a rental on Expenses (or Finance → Expenses) fills the Vehicle
-- field with that rental's car before saving, instead of only checking it on
-- save. rental_expense_options gains vehicle_id (added last, so the view is
-- replaced in place). Otherwise as 20261121090000_rental_line_costs.
-- ===========================================================================

create or replace view public.rental_expense_options
with (security_invoker = true)
as
select
  r.id,
  r.reference_number,
  concat_ws(
    ' · ',
    c.full_name,
    v.plate_number,
    to_char(r.start_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY')
  ) as summary,
  r.start_at,
  r.status,
  r.vehicle_id
from public.rentals r
join public.customers c on c.id = r.customer_id
join public.vehicles v on v.id = r.vehicle_id;

revoke all on public.rental_expense_options from anon, authenticated;
grant select on public.rental_expense_options to authenticated;
grant select on public.rental_expense_options to service_role;
