export type CustomerBookingStatus =
  | "draft"
  | "reserved"
  | "active"
  | "completed"
  | "cancelled"
  | "overdue";

export type RentalPaymentStatus =
  | "unpaid"
  | "proof_submitted"
  | "deposit_paid"
  | "paid_in_full"
  | "refunded";

export type CustomerBooking = {
  id: string;
  referenceNumber: string;
  status: CustomerBookingStatus;
  paymentStatus: RentalPaymentStatus;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string | null;
  pickupLocation: string | null;
  returnLocation: string | null;
  vehicleId: string;
  vehicleName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePhotoUrl: string | null;
  quotedTotal: number | null;
  depositAmount: number | null;
  balanceDue: number | null;
  createdAt: string;
};

export function isAwaitingPayment(booking: CustomerBooking) {
  return (
    booking.status === "draft" &&
    (booking.paymentStatus === "unpaid" ||
      booking.paymentStatus === "proof_submitted")
  );
}

export function isCurrentBookingStatus(status: CustomerBookingStatus) {
  return (
    status === "draft" ||
    status === "reserved" ||
    status === "active" ||
    status === "overdue"
  );
}
