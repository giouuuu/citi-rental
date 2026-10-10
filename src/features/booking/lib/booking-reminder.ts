import {
  isAwaitingPayment,
  type CustomerBooking,
} from "@/features/booking/types/customer-booking";

export type BookingReminderKind =
  | "pay"
  | "proof-review"
  | "upcoming"
  | "on-trip"
  | "overdue";

export type BookingReminder = {
  kind: BookingReminderKind;
  booking: CustomerBooking;
  href: string;
  /** Other bookings that would also have earned the card. */
  moreCount: number;
};

export function bookingPayPath(booking: CustomerBooking) {
  return `/book/pay/${booking.id}?ref=${encodeURIComponent(booking.referenceNumber)}`;
}

const byStart = (a: CustomerBooking, b: CustomerBooking) =>
  a.startAt.localeCompare(b.startAt);

/**
 * The one booking worth surfacing above the landing search: an unfinished
 * one first (it holds nothing until paid), then the trip on the road, then
 * the next reserved one. Drafts whose pick-up has passed are dead, not
 * unfinished, so they never nag.
 */
export function pickBookingReminder(
  bookings: CustomerBooking[],
  now: Date = new Date(),
): BookingReminder | null {
  const nowIso = now.toISOString();
  const unfinished = bookings
    .filter(
      (booking) =>
        isAwaitingPayment(booking) &&
        new Date(booking.startAt).toISOString() > nowIso,
    )
    .sort(byStart);
  const overdue = bookings.filter((b) => b.status === "overdue").sort(byStart);
  const onTrip = bookings.filter((b) => b.status === "active").sort(byStart);
  const upcoming = bookings
    .filter((b) => b.status === "reserved")
    .sort(byStart);

  const candidates = [...unfinished, ...overdue, ...onTrip, ...upcoming];
  const booking = candidates[0];
  if (!booking) return null;

  const moreCount = candidates.length - 1;
  if (isAwaitingPayment(booking)) {
    return {
      kind:
        booking.paymentStatus === "proof_submitted" ? "proof-review" : "pay",
      booking,
      href: bookingPayPath(booking),
      moreCount,
    };
  }

  return {
    kind:
      booking.status === "overdue"
        ? "overdue"
        : booking.status === "active"
          ? "on-trip"
          : "upcoming",
    booking,
    href: "/account#current-bookings",
    moreCount,
  };
}
