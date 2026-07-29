export type RentalPaymentStatus =
  | "unpaid"
  | "proof_submitted"
  | "deposit_paid"
  | "paid_in_full"
  | "refunded";

export type BookingPaymentDetails = {
  rentalId: string;
  organizationId: string;
  referenceNumber: string;
  status: string;
  startAt: string;
  expectedReturnAt: string;
  quotedDailyRate: number;
  quotedDays: number;
  quotedTotal: number;
  depositPercent: number;
  depositAmount: number;
  balanceDue: number;
  paymentStatus: RentalPaymentStatus;
  paymentReference: string | null;
  hasPaymentProof: boolean;
  paymentProofSubmittedAt: string | null;
  vehicleName: string;
  vehicleMake: string;
  vehicleModel: string;
  paymentQrUrl: string | null;
  paymentInstructions: string | null;
  organizationName: string;
};

export type PublicBookingResult = {
  rentalId: string;
  referenceNumber: string;
  vehicleId: string;
  vehicleName?: string;
  startAt: string;
  expectedReturnAt: string;
  quotedDailyRate: number;
  quotedDays: number;
  quotedTotal: number;
  depositPercent: number;
  depositAmount: number;
  balanceDue: number;
  paymentStatus: RentalPaymentStatus;
  message: string;
};
