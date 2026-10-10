import type { StatusTone } from "@/components/design-system/status-badge";
import type {
  CustomerBookingStatus,
  RentalPaymentStatus,
} from "@/features/booking/types/customer-booking";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";

/** The booking's payment state in the renter's words; null when nothing is worth saying. */
export function customerPaymentLabel(
  status: CustomerBookingStatus,
  paymentStatus: RentalPaymentStatus,
): string | null {
  if (paymentStatus === "proof_submitted") return "Proof submitted";
  if (paymentStatus === "deposit_paid") return "Reservation fee paid";
  if (paymentStatus === "paid_in_full") return "Paid in full";
  if (paymentStatus === "refunded") return "Refunded";
  if (status === "draft") return "Awaiting payment";
  return null;
}

/** One ledger row as the renter reads it: "Reservation fee", "Car wash", "Refund to you". */
export function customerPaymentTitle(payment: RentalPayment): string {
  switch (payment.paymentType) {
    case "deposit":
      return "Reservation fee";
    case "balance":
      return "Payment";
    case "adjustment":
      return "Adjustment";
    case "refund":
      return "Refund to you";
    case "penalty":
      return payment.chargeTypeName ?? "Extra charge";
  }
}

export function customerPaymentStatus(payment: RentalPayment): { label: string; tone: StatusTone } {
  switch (payment.status) {
    case "submitted":
      return { label: "Being checked", tone: "pending" };
    case "confirmed":
      return payment.paymentType === "refund"
        ? { label: "Refunded", tone: "completed" }
        : { label: "Received", tone: "received" };
    case "rejected":
      return { label: "Not accepted", tone: "critical" };
    case "cancelled":
      return { label: "Cancelled", tone: "cancelled" };
  }
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
  paymongo: "Online payment",
  other: "Other",
};

export function paymentMethodLabel(method: string | null): string | null {
  if (!method) return null;
  return METHOD_LABELS[method.toLowerCase()] ?? method;
}

/** Why a booking was cancelled, said to the renter. */
export function customerCancellationLabel(reason: string | null): string {
  switch (reason) {
    case "customer_request":
      return "You cancelled this booking.";
    case "no_show":
      return "Cancelled: no one came to pick up the car.";
    case "payment_not_received":
      return "Cancelled: the reservation fee didn't come in.";
    case "vehicle_unavailable":
      return "Cancelled: the car became unavailable. We're sorry.";
    case "duplicate":
      return "Cancelled as a duplicate booking.";
    default:
      return "This booking was cancelled.";
  }
}
