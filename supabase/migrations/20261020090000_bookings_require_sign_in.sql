-- Booking needs a signed-in customer. Guest booking is gone:
--
-- 1. create_public_booking: anon loses execute; authenticated keeps it.
-- 2. booking-ids bucket: only authenticated callers may upload renter IDs.
-- 3. The guest "email or mobile number" lookup and its rate-limit table are
--    dropped. The customers phone/email indexes stay; create_public_booking
--    still matches on them.
--
-- Payment proof (/book/pay) is untouched so bookings already made as a guest
-- can still be paid.

-- ---------------------------------------------------------------------------
-- 1. Booking RPC: signed-in only
-- ---------------------------------------------------------------------------
revoke execute on function public.create_public_booking(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text,
  text, text, text, integer, text, text, boolean
) from anon;

-- ---------------------------------------------------------------------------
-- 2. Renter ID uploads: signed-in only
-- ---------------------------------------------------------------------------
drop policy if exists booking_ids_insert_public on storage.objects;
create policy booking_ids_insert_public
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-ids'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(license-selfie|government-id)\.(jpg|png|webp|gif)$'
);

-- ---------------------------------------------------------------------------
-- 3. Guest contact lookup: removed
-- ---------------------------------------------------------------------------
drop function if exists public.lookup_booking_contact(text, text, text);
drop table if exists private.booking_contact_lookups;
