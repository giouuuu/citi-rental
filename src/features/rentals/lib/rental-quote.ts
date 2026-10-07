import { daysBetweenKeys, manilaDateKey } from "@/features/shared/lib/manila-time";

/**
 * Billed days for a rental: inclusive Manila calendar days from pickup to
 * return, at least 1. Same rule as create_public_booking, so a car costs the
 * same booked online or at the counter.
 */
export function rentalBilledDays(startAt: Date, returnAt: Date): number {
  return Math.max(1, daysBetweenKeys(manilaDateKey(startAt), manilaDateKey(returnAt)));
}

export function rentalQuote(dailyRate: number, days: number) {
  return {
    quoted_daily_rate: dailyRate,
    quoted_days: days,
    quoted_total: Math.round(dailyRate * days * 100) / 100,
  };
}

/** Extra billed days when the return moves from `currentReturnAt` to `newReturnAt`. */
export function extensionDays(
  startAt: Date,
  currentReturnAt: Date,
  newReturnAt: Date,
): number {
  return Math.max(
    0,
    rentalBilledDays(startAt, newReturnAt) - rentalBilledDays(startAt, currentReturnAt),
  );
}
