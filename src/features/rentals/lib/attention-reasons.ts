import type { StatusTone } from "@/components/design-system/status-badge";

/** Why a rental is on the /rentals "Needs attention" list (list_rentals_needing_attention). */
export type AttentionReason =
  | "overdue"
  | "proof_to_check"
  | "late_pickup"
  | "refund_due"
  | "balance_due";

export type RentalNeedingAttention = {
  id: string;
  reference: string;
  reason: AttentionReason;
  /** The moment the reason dates from: return time, pickup time, cancellation… */
  dueAt: string;
  status: string;
  paymentStatus: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  vehicleId: string;
  vehiclePlate: string;
  vehicleName: string;
  startAt: string;
  expectedReturnAt: string;
  billTotal: number;
  amountPaid: number;
  billBalance: number;
};

export const ATTENTION_REASONS: Record<
  AttentionReason,
  { label: string; tone: StatusTone; action: string }
> = {
  overdue: {
    label: "Overdue return",
    tone: "overdue",
    action: "Reach the renter, then complete the return or extend.",
  },
  proof_to_check: {
    label: "Proof to check",
    tone: "pending",
    action: "Confirm or reject the reservation fee proof.",
  },
  late_pickup: {
    label: "Late pickup",
    tone: "delayed",
    action: "Release the car, or cancel the booking.",
  },
  refund_due: {
    label: "Refund owed",
    tone: "delayed",
    action: "Return the money and record the refund.",
  },
  balance_due: {
    label: "Balance unpaid",
    tone: "delayed",
    action: "Collect the balance and record the payment.",
  },
};

export function isAttentionReason(value: unknown): value is AttentionReason {
  return typeof value === "string" && value in ATTENTION_REASONS;
}
