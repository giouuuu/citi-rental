export type PaymentType =
  | "deposit"
  | "balance"
  | "penalty"
  | "refund"
  | "adjustment";

export type PaymentEntryStatus =
  | "submitted"
  | "confirmed"
  | "rejected"
  | "cancelled";

export type RentalPayment = {
  id: string;
  rentalId: string;
  paymentType: PaymentType;
  amount: number;
  currency: string;
  method: string | null;
  status: PaymentEntryStatus;
  externalReference: string | null;
  proofPath: string | null;
  proofUrl: string | null;
  notes: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  /** Penalty rows are charges on the bill; this names their charge type. */
  chargeTypeName: string | null;
};

/** A fee staff can add to a rental bill. */
export type RentalChargeType = {
  id: string;
  name: string;
  defaultAmount: number | null;
};

export type RentalPaymentStatus =
  | "unpaid"
  | "proof_submitted"
  | "deposit_paid"
  | "paid_in_full"
  | "refunded";
