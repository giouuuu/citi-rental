-- Kilometres a rental put on the car: the return odometer less the release
-- odometer, kept on the row so the rentals list can show, sort and export it
-- and the car and customer pages can total it. Null until both readings exist
-- (not released yet, or still out).

alter table public.rentals
  add column km_driven numeric(12, 1)
    generated always as (ending_odometer - starting_odometer) stored;

comment on column public.rentals.km_driven is
  'Return odometer minus release odometer (km). Null until both are recorded.';
