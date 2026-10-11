-- A car released ahead of its booked pickup can come back before that pickup
-- time too (booked Oct 23, released and returned Oct 11). The old check
-- (actual_return_at >= start_at) rejected that return outright. The return now
-- only has to follow the booked pickup or the moment the booking was made,
-- whichever is earlier: early returns pass, and backfilled past rentals (made
-- after their pickup) still need a return after the pickup.

alter table public.rentals
  drop constraint rentals_actual_return_check;

alter table public.rentals
  add constraint rentals_actual_return_check check (
    actual_return_at is null
    or actual_return_at >= least(start_at, created_at)
  );
