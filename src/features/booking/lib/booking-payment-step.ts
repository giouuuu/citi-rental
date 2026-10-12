/** What the renter may pay now; private.customer_payment_kind decides it in SQL. */
export type CustomerPaymentKind = "reservation_fee" | "open_bill";

/** Where the pay page stands, from the booking's payment kind and its ledger. */
export type BookingPaymentStep =
  /** Send at least the fee (`amount`), up to the whole bill (`max`) to pay it all now. */
  | { kind: "reservation_fee"; amount: number; max: number }
  /** The fee was sent and staff have not confirmed it yet. */
  | { kind: "reservation_fee_sent" }
  /** `payable` is the open balance less payments still being checked. */
  | { kind: "open_bill"; balance: number; pending: number; payable: number }
  /** Payments being checked already cover the open balance. */
  | { kind: "open_bill_sent"; balance: number; pending: number }
  | { kind: "nothing_due" };

const round = (value: number) => Math.round(value * 100) / 100;

const PAID_STATUSES = new Set(["deposit_paid", "paid_in_full", "refunded"]);

/**
 * Same rule as private.customer_payment_kind, for screens whose data does not
 * carry it (the account page). A draft pays the reservation fee; so does a
 * booking staff reserved before any money came in. After that the renter can
 * pay down whatever is left on the bill until it is settled.
 */
export function customerPaymentKind(booking: {
  status: string;
  paymentStatus: string;
  depositAmount: number | null;
  billTotal: number;
  amountPaid: number;
}): CustomerPaymentKind | null {
  if (booking.status === "draft") {
    return PAID_STATUSES.has(booking.paymentStatus) ? null : "reservation_fee";
  }
  if (
    booking.status === "reserved" &&
    (booking.depositAmount ?? 0) > 0 &&
    (booking.paymentStatus === "unpaid" || booking.paymentStatus === "proof_submitted") &&
    booking.amountPaid === 0
  ) {
    return "reservation_fee";
  }
  if (
    ["reserved", "active", "overdue", "completed"].includes(booking.status) &&
    round(booking.billTotal - booking.amountPaid) > 0
  ) {
    return "open_bill";
  }
  return null;
}

export function bookingPaymentStep(booking: {
  paymentKind: CustomerPaymentKind | null;
  paymentStatus: string;
  depositAmount: number;
  depositPending: boolean;
  billTotal: number;
  amountPaid: number;
  pendingPaymentAmount: number;
}): BookingPaymentStep {
  if (booking.paymentKind === "reservation_fee") {
    return booking.depositPending || booking.paymentStatus === "proof_submitted"
      ? { kind: "reservation_fee_sent" }
      : {
          kind: "reservation_fee",
          amount: booking.depositAmount,
          max: Math.max(booking.depositAmount, round(booking.billTotal - booking.amountPaid)),
        };
  }
  if (booking.paymentKind === "open_bill") {
    const balance = Math.max(0, round(booking.billTotal - booking.amountPaid));
    const pending = round(booking.pendingPaymentAmount);
    const payable = round(balance - pending);
    return payable > 0
      ? { kind: "open_bill", balance, pending, payable }
      : { kind: "open_bill_sent", balance, pending };
  }
  return { kind: "nothing_due" };
}
