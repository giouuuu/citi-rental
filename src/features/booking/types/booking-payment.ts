import type { CustomerPaymentKind } from "@/features/booking/lib/booking-payment-step";
import type { BookingFeeLine } from "@/features/booking/lib/booking-fees";
import type {
  RentalBillDriver,
  RentalBillHandover,
} from "@/features/rentals/lib/rental-bill";

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
  /** Whole days; inclusive calendar days when `quotedHours` is null (older quotes). */
  quotedDays: number;
  /** Hours past the whole days; null on bookings quoted by calendar days. */
  quotedHours: number | null;
  /** Rent, driver and delivery; the parts below are inside it. */
  quotedTotal: number;
  /** With-driver bookings: the driver line inside `quotedTotal`. */
  driver: RentalBillDriver | null;
  /** Pick-up and return, and their delivery fees inside `quotedTotal`. */
  handover: RentalBillHandover;
  /** Fees added to every online booking, inside `quotedTotal`. */
  bookingFees: BookingFeeLine[];
  pickupLocation: string | null;
  returnLocation: string | null;
  /** Charged only if the car comes back unwashed. Null: not set, or the
   *  booking already pays for the wash (then nothing is said about it). */
  carWashFee: number | null;
  depositAmount: number;
  balanceDue: number;
  paymentStatus: RentalPaymentStatus;
  /** What the renter may pay now; null when nothing is due. */
  paymentKind: CustomerPaymentKind | null;
  /** Trip total plus confirmed charges. */
  billTotal: number;
  /** Confirmed money in, less refunds. */
  amountPaid: number;
  /** Bill payments sent and still being checked by staff. */
  pendingPaymentAmount: number;
  paymentReference: string | null;
  hasPaymentProof: boolean;
  paymentProofSubmittedAt: string | null;
  /** A deposit was sent and is waiting for staff (proof upload or PayMongo). */
  depositPending: boolean;
  /** Another booking already holds these dates, so this one can't take them. */
  datesTaken: boolean;
  vehicleName: string;
  vehicleMake: string;
  vehicleModel: string;
  paymentQrUrl: string | null;
  paymentInstructions: string | null;
  companyName: string;
  cancelledAt: string | null;
  /** Set when a paid booking is cancelled: true keeps the fee, false refunds it. */
  reservationFeeForfeited: boolean | null;
};

export type PublicBookingResult = {
  rentalId: string;
  referenceNumber: string;
  vehicleId: string;
  vehicleName?: string;
  startAt: string;
  expectedReturnAt: string;
  quotedDailyRate: number;
  /** Whole days; inclusive calendar days when `quotedHours` is null (older quotes). */
  quotedDays: number;
  /** Hours past the whole days; null on bookings quoted by calendar days. */
  quotedHours: number | null;
  quotedTotal: number;
  /** The customer asked for a driver; `driverFee` is inside `quotedTotal`. */
  withDriver: boolean;
  driverFee: number;
  /** What the database saved: the office address for an office pick-up. */
  pickupLocation: string;
  /** Pick-up and return; their fees are inside `quotedTotal`. */
  handover: RentalBillHandover;
  /** Fees added to every online booking, inside `quotedTotal`. */
  bookingFees: BookingFeeLine[];
  depositAmount: number;
  balanceDue: number;
  paymentStatus: RentalPaymentStatus;
  message: string;
};
