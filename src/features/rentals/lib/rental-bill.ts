import type { RentalPayment } from "@/features/rentals/types/rental-payment";

export type RentalBill = {
  rent: { dailyRate: number | null; days: number | null; total: number };
  /** Confirmed charges (penalty rows): car wash, delivery, extension, fuel, … */
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
  quotedDailyRate,
  quotedDays,
  quotedTotal,
  payments,
}: {
  quotedDailyRate: number | null;
  quotedDays: number | null;
  quotedTotal: number | null;
  payments: RentalPayment[];
}): RentalBill {
  // A bill reads in the order things happened; the ledger arrives newest first.
  const charges = payments
    .filter((payment) => payment.paymentType === "penalty" && payment.status === "confirmed")
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const received = payments.filter((payment) => payment.paymentType !== "penalty");

  const rentTotal = quotedTotal ?? 0;
  const total = round(rentTotal + charges.reduce((sum, charge) => sum + charge.amount, 0));
  const paid = round(
    received.reduce((sum, payment) => {
      if (payment.status !== "confirmed") return sum;
      if (CREDITS.has(payment.paymentType)) return sum + payment.amount;
      if (payment.paymentType === "refund") return sum - payment.amount;
      return sum;
    }, 0),
  );

  return {
    rent: { dailyRate: quotedDailyRate, days: quotedDays, total: rentTotal },
    charges,
    total,
    paid,
    balance: Math.max(0, round(total - paid)),
    received,
  };
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
