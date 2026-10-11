import type { RentRates } from "@/features/rentals/lib/rent-pricing";
import { extensionCharge } from "@/features/rentals/lib/rental-quote";

/** What the return sign-off needs to price lateness and settle the bill. */
export type ReturnBillContext = {
  startAt: string;
  expectedReturnAt: string;
  /** The rates extra time is priced at; null when the rental has none. */
  rates: RentRates | null;
  /** Rent plus confirmed charges already on the bill. */
  billTotal: number;
  /** Confirmed money in, less refunds. */
  paid: number;
};

export type LateReturn = {
  dueAt: string;
  /** Started hours past the return date. */
  hoursLate: number;
  /** The extra time priced at the rental's rates, as an extension would be. */
  suggested: number;
};

const HOUR_MS = 3_600_000;
const round = (value: number) => Math.round(value * 100) / 100;

/** How late the car is back, or null when it is on time. */
export function lateReturn(
  context: Pick<ReturnBillContext, "startAt" | "expectedReturnAt" | "rates">,
  now: Date,
): LateReturn | null {
  const due = new Date(context.expectedReturnAt);
  const lateMs = now.getTime() - due.getTime();
  if (!Number.isFinite(lateMs) || lateMs <= 0) return null;

  const extra = context.rates
    ? extensionCharge(new Date(context.startAt), due, now, context.rates)
    : null;
  return {
    dueAt: context.expectedReturnAt,
    hoursLate: Math.ceil(lateMs / HOUR_MS),
    suggested: extra?.amount ?? 0,
  };
}

export type ReturnSettlement = {
  /** Bill so far plus the charges posted at return. */
  total: number;
  /** What is owed before the payment taken at return. */
  balanceDue: number;
  /** What stays unpaid after it. */
  balanceAfter: number;
};

/** The bill after the return charges and the counter payment. */
export function settleReturn({
  billTotal,
  paid,
  charges,
  payment,
}: {
  billTotal: number;
  paid: number;
  charges: number[];
  payment: number;
}): ReturnSettlement {
  const total = round(billTotal + charges.reduce((sum, charge) => sum + charge, 0));
  const balanceDue = Math.max(0, round(total - paid));
  return { total, balanceDue, balanceAfter: Math.max(0, round(balanceDue - payment)) };
}
