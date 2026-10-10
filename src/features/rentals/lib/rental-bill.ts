import {
  describeBilledTime,
  describeRent,
  quoteRentForHours,
  type RentRates,
} from "@/features/rentals/lib/rent-pricing";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";
import { formatPhpExact } from "@/features/shared/lib/money";

export type RentalBillRent = {
  rates: RentRates | null;
  /** Whole days; inclusive calendar days when `hours` is null (older quotes). */
  days: number | null;
  /** Hours past the whole days; null on rentals quoted by calendar days. */
  hours: number | null;
  total: number;
};

/** A with-driver rental's driver line; its fee is inside `quoted_total`. */
export type RentalBillDriver = {
  fee: number;
  /** Day rate at booking; null when staff quote the driver. */
  rate: number | null;
  days: number | null;
};

export type RentalBill = {
  rent: RentalBillRent;
  driver: RentalBillDriver | null;
  /** Confirmed charges (penalty rows): car wash, delivery, extension, fuel, bill adjustments, … */
  charges: RentalPayment[];
  total: number;
  /** Confirmed money in, less refunds. */
  paid: number;
  balance: number;
  /** Money-in rows for the history list, charges left out. */
  received: RentalPayment[];
};

const CREDITS = new Set(["deposit", "balance", "adjustment"]);

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The running bill: rent plus charges, less what was paid. Same formula as
 * private.refresh_rental_payment_summary, which writes rentals.balance_due.
 */
export function buildRentalBill({
  quotedRates,
  quotedDays,
  quotedHours = null,
  quotedTotal,
  driver = null,
  payments,
}: {
  quotedRates: RentRates | null;
  quotedDays: number | null;
  quotedHours?: number | null;
  quotedTotal: number | null;
  driver?: RentalBillDriver | null;
  payments: RentalPayment[];
}): RentalBill {
  // A bill reads in the order things happened; the ledger arrives newest first.
  const charges = payments
    .filter((payment) => payment.paymentType === "penalty" && payment.status === "confirmed")
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const received = payments.filter((payment) => payment.paymentType !== "penalty");

  const quoted = quotedTotal ?? 0;
  // quoted_total holds the car and the driver; the bill shows them apart.
  const rentTotal = round(quoted - (driver?.fee ?? 0));
  const total = round(quoted + charges.reduce((sum, charge) => sum + charge.amount, 0));
  const paid = round(
    received.reduce((sum, payment) => {
      if (payment.status !== "confirmed") return sum;
      if (CREDITS.has(payment.paymentType)) return sum + payment.amount;
      if (payment.paymentType === "refund") return sum - payment.amount;
      return sum;
    }, 0),
  );

  return {
    rent: { rates: quotedRates, days: quotedDays, hours: quotedHours, total: rentTotal },
    driver,
    charges,
    total,
    paid,
    balance: Math.max(0, round(total - paid)),
    received,
  };
}

/** "3 days 2 hours · ₱1,350.00 × 3 days + 2 hours × ₱150.00"; null when there is no rate. */
export function describeRentLine(rent: RentalBillRent): string | null {
  if (!rent.rates || rent.days == null) return null;
  if (rent.hours == null) {
    return `${formatPhpExact(rent.rates.daily)} × ${rent.days} ${rent.days === 1 ? "day" : "days"}`;
  }
  const quote = quoteRentForHours(rent.days * 24 + rent.hours, rent.rates);
  return `${describeBilledTime(quote)} · ${describeRent(quote, rent.rates)}`;
}

/**
 * What the bill header says. The stored payment_status only knows deposits
 * and paid-in-full, so a counter payment with no deposit would read "unpaid".
 */
export function rentalBillStatus(bill: RentalBill, paymentStatus?: string | null): string {
  if (paymentStatus === "refunded") return "Refunded";
  if (bill.total > 0 && bill.balance <= 0) return "Paid in full";
  if (bill.paid > 0) return "Partly paid";
  if (paymentStatus === "proof_submitted") return "Payment proof to check";
  return "Unpaid";
}

export type ChargeCostSummary = {
  /** Charges that carry a cost, as billed to the renter. */
  charged: number;
  /** What the business paid out to deliver them. */
  costs: number;
  /** charged − costs; negative when a charge cost more than it brought in. */
  kept: number;
};

/**
 * Charges set against what they cost the business, counting only charges with
 * a cost entered, so a ₱1,000 extension with no cost does not inflate "kept".
 * Null when no charge has a cost. Internal: never part of the renter's bill.
 */
export function summarizeChargeCosts(
  charges: RentalPayment[],
  costs: Record<string, number>,
): ChargeCostSummary | null {
  const withCost = charges.filter((charge) => (costs[charge.id] ?? 0) > 0);
  if (withCost.length === 0) return null;
  const charged = round(withCost.reduce((sum, charge) => sum + charge.amount, 0));
  const paidOut = round(withCost.reduce((sum, charge) => sum + costs[charge.id], 0));
  return { charged, costs: paidOut, kept: round(charged - paidOut) };
}
