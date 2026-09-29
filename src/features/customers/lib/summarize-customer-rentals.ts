import type {
  CustomerRental,
  CustomerRentalSummary,
} from "@/features/customers/types/customer-rental";

/** The newest rentals shown on a customer; older ones stay in /rentals. */
export const CUSTOMER_RENTAL_LIMIT = 100;

const DAY_MS = 86_400_000;
/** Same grace the analytics RPCs use before a return counts as late. */
const LATE_GRACE_MS = 3_600_000;
const OCCUPYING = new Set(["reserved", "active", "overdue", "completed"]);

/**
 * What a rental still owes: quote plus penalties, less money collected. Only
 * cars that went out owe anything — a reserved booking's balance is due at
 * pickup, so it is not a debt yet.
 */
export function rentalOutstanding(rental: CustomerRental): number {
  if (!["active", "overdue", "completed"].includes(rental.status)) return 0;
  return Math.max(0, Math.round((rental.quotedTotal + rental.penalties - rental.collected) * 100) / 100);
}

export function isLateReturn(rental: CustomerRental): boolean {
  if (rental.status !== "completed" || !rental.actualReturnAt) return false;
  return (
    new Date(rental.actualReturnAt).getTime() >
    new Date(rental.expectedReturnAt).getTime() + LATE_GRACE_MS
  );
}

/**
 * A customer's track record. Lifetime value is money actually collected
 * (penalties excluded until paid, refunds netted) — the same definition the
 * analytics screen uses, so the two never disagree about a customer.
 */
export function summarizeCustomerRentals(rentals: CustomerRental[]): CustomerRentalSummary {
  const occupying = rentals.filter((rental) => OCCUPYING.has(rental.status));
  const starts = occupying.map((rental) => rental.startAt).sort();
  const durations = occupying.map((rental) => {
    const end = new Date(rental.actualReturnAt ?? rental.expectedReturnAt).getTime();
    return Math.max(0, end - new Date(rental.startAt).getTime()) / DAY_MS;
  });

  return {
    rentals: occupying.length,
    cancellations: rentals.filter((rental) => rental.status === "cancelled").length,
    lifetimeValue:
      Math.round(rentals.reduce((sum, rental) => sum + rental.collected, 0) * 100) / 100,
    outstanding:
      Math.round(rentals.reduce((sum, rental) => sum + rentalOutstanding(rental), 0) * 100) / 100,
    lateReturns: rentals.filter(isLateReturn).length,
    averageDays: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : null,
    firstRentalAt: starts[0] ?? null,
    lastRentalAt: starts.at(-1) ?? null,
  };
}
