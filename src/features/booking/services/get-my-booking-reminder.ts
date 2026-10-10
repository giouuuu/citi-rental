import "server-only";

import {
  pickBookingReminder,
  type BookingReminder,
} from "@/features/booking/lib/booking-reminder";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { listMyBookings } from "@/features/booking/services/list-my-bookings";

/** The landing's "finish / view your booking" card. Guests skip the RPC. */
export async function getMyBookingReminder(): Promise<BookingReminder | null> {
  if (!(await isBookingUserSignedIn())) return null;
  return pickBookingReminder(await listMyBookings());
}
