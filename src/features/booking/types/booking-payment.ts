export type RentalPaymentStatus =
  | "unpaid"
  | "proof_submitted"
  | "deposit_paid"
  | "paid_in_full"
  | "refunded";

export type BookingPaymentDetails = {
  rentalId: string;
  referenceNumber: string;
  status: string;
  startAt: string;
  expectedReturnAt: string;
  quotedDailyRate: number;
  quotedHalfDayRate: number | null;
  quotedHourlyRate: number | null;
  /** Whole days; inclusive calendar days when `quotedHours` is null (older quotes). */
  quotedDays: number;
  /** Hours past the whole days; null on bookings quoted by calendar days. */
  quotedHours: number | null;
  quotedTotal: number;
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
  companyName: string;
};

export type PublicBookingResult = {
  rentalId: string;
  referenceNumber: string;
  vehicleId: string;
  vehicleName?: string;
  startAt: string;
  expectedReturnAt: string;
  quotedDailyRate: number;
  quotedHalfDayRate: number | null;
  quotedHourlyRate: number | null;
  /** Whole days; inclusive calendar days when `quotedHours` is null (older quotes). */
  quotedDays: number;
  /** Hours past the whole days; null on bookings quoted by calendar days. */
  quotedHours: number | null;
  quotedTotal: number;
  /** The customer asked for a driver; `driverFee` is inside `quotedTotal`. */
  withDriver: boolean;
  driverFee: number;
  depositAmount: number;
  balanceDue: number;
  paymentStatus: RentalPaymentStatus;
  message: string;
};
