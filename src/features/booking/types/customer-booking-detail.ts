import type {
  CustomerBookingStatus,
  RentalPaymentStatus,
} from "@/features/booking/types/customer-booking";
import type { RentalBill } from "@/features/rentals/lib/rental-bill";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";

/** The renter's own review of a trip. */
export type CustomerBookingReview = {
  id: string;
  rating: number | null;
  body: string | null;
  reviewerName: string | null;
  /** The owner published it on the homepage. */
  isPublished: boolean;
  createdAt: string;
};

/** One booking in full, as its signed-in owner sees it (get_my_booking). */
export type CustomerBookingDetail = {
  id: string;
  referenceNumber: string;
  status: CustomerBookingStatus;
  paymentStatus: RentalPaymentStatus;
  bookedOnline: boolean;
  createdAt: string;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string | null;
  pickupLocation: string | null;
  returnLocation: string | null;
  destination: string | null;
  passengerCount: number | null;
  withDriver: boolean;
  /** The reservation fee asked to hold the dates. */
  depositAmount: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** Set on cancellation once something was paid: true when the fee was kept. */
  reservationFeeForfeited: boolean | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  freeCancellationHours: number | null;
  vehicle: {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    year: number | null;
    plateNumber: string | null;
    photoUrl: string | null;
    transmission: string | null;
    seatingCapacity: number | null;
  };
  customer: {
    fullName: string | null;
    phoneNumber: string | null;
    email: string | null;
  };
  /** Rent, driver, charges, paid and balance, from the payments ledger. */
  bill: RentalBill;
  /** Every non-cancelled ledger row, newest first. */
  payments: RentalPayment[];
  review: CustomerBookingReview | null;
};
