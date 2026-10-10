import type { RentalPaymentStatus } from "@/features/booking/types/booking-payment";

/** Settings default when the free-cancellation window is not set. */
export const DEFAULT_FREE_CANCELLATION_HOURS = 24;

/** The renter has paid, or sent proof of paying, the reservation fee. */
export function isReservationFeePaid(paymentStatus: RentalPaymentStatus) {
  return (
    paymentStatus === "proof_submitted" ||
    paymentStatus === "deposit_paid" ||
    paymentStatus === "paid_in_full"
  );
}

/**
 * Inside the window before pickup a paid reservation fee is kept on
 * cancellation. Mirrors cancel_my_booking, which makes the binding call.
 */
export function isInsideNoRefundWindow(
  startAt: string,
  freeCancellationHours: number | null | undefined,
  now: Date = new Date(),
) {
  const hours = freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS;
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) return false;
  return now.getTime() > start - hours * 60 * 60 * 1000;
}

export type CancellationOutcome = "nothing-paid" | "refundable" | "forfeited";

export function cancellationOutcome({
  paymentStatus,
  startAt,
  freeCancellationHours,
  now,
}: {
  paymentStatus: RentalPaymentStatus;
  startAt: string;
  freeCancellationHours: number | null | undefined;
  now?: Date;
}): CancellationOutcome {
  if (!isReservationFeePaid(paymentStatus)) return "nothing-paid";
  return isInsideNoRefundWindow(startAt, freeCancellationHours, now)
    ? "forfeited"
    : "refundable";
}

export function hoursPhrase(hours: number) {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
