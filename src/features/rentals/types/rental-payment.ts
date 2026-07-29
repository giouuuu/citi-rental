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
};

export type RentalPaymentStatus =
  | "unpaid"
  | "proof_submitted"
  | "deposit_paid"
  | "paid_in_full"
  | "refunded";
