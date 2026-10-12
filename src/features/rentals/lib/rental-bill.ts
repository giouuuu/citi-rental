import {
  describeBilledTime,
  describeRent,
  quoteRentForHours,
  type RentRates,
} from "@/features/rentals/lib/rent-pricing";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";
import {
  type BookingFeeLine,
  bookingFeesTotal,
} from "@/features/booking/lib/booking-fees";
import {
  handoverBillLine,
  type HandoverLeg,
  type HandoverMethod,
} from "@/features/booking/lib/handover";
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

/** How the car changes hands at each end; fees are inside `quoted_total`. */
export type RentalBillHandover = {
  pickupMethod: HandoverMethod | null;
  returnMethod: HandoverMethod | null;
  pickupFee: number;
  returnFee: number;
};

export type RentalBillHandoverLine = {
  leg: HandoverLeg;
  label: string;
  detail: string;
  fee: number;
};

export type RentalBill = {
  rent: RentalBillRent;
  driver: RentalBillDriver | null;
  /** Pick-up then return; legs with no method recorded are left out. */
  handover: RentalBillHandoverLine[];
  /** Fees added to every online booking, as booked; inside `quoted_total`. */
  bookingFees: BookingFeeLine[];
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
  handover = null,
  bookingFees = [],
  payments,
}: {
  quotedRates: RentRates | null;
  quotedDays: number | null;
  quotedHours?: number | null;
  quotedTotal: number | null;
  driver?: RentalBillDriver | null;
  handover?: RentalBillHandover | null;
  bookingFees?: BookingFeeLine[];
  payments: RentalPayment[];
}): RentalBill {
  // A bill reads in the order things happened; the ledger arrives newest first.
  const charges = payments
    .filter((payment) => payment.paymentType === "penalty" && payment.status === "confirmed")
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const received = payments.filter((payment) => payment.paymentType !== "penalty");

  const quoted = quotedTotal ?? 0;
  const handoverLines: RentalBillHandoverLine[] = handover
    ? (
        [
          ["pickup", handover.pickupMethod, handover.pickupFee],
          ["return", handover.returnMethod, handover.returnFee],
        ] as const
      ).flatMap(([leg, method, fee]) => {
        const line = handoverBillLine(leg, method, fee, driver != null);
        return line ? [{ leg, ...line }] : [];
      })
    : [];
  // quoted_total holds the car, the driver, delivery and the booking fees;
  // the bill shows them apart.
  const rentTotal = round(
    quoted -
      (driver?.fee ?? 0) -
      (handover ? handover.pickupFee + handover.returnFee : 0) -
      bookingFeesTotal(bookingFees),
  );
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
    handover: handoverLines,
    bookingFees,
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
