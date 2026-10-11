import "server-only";

import type {
  CustomerBookingStatus,
  RentalPaymentStatus,
} from "@/features/booking/types/customer-booking";
import type {
  CustomerBookingDetail,
  CustomerBookingReview,
} from "@/features/booking/types/customer-booking-detail";
import { parseBookingFees } from "@/features/booking/lib/booking-fees";
import { parseHandoverMethod } from "@/features/booking/lib/handover";
import { buildRentalBill } from "@/features/rentals/lib/rental-bill";
import type {
  PaymentEntryStatus,
  PaymentType,
  RentalPayment,
} from "@/features/rentals/types/rental-payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapPayment(rentalId: string, row: Json): RentalPayment {
  return {
    id: String(row.id),
    rentalId,
    paymentType: row.payment_type as PaymentType,
    amount: num(row.amount) ?? 0,
    currency: "PHP",
    method: text(row.method),
    status: row.status as PaymentEntryStatus,
    externalReference: text(row.external_reference),
    // Proof files and staff notes stay internal.
    proofPath: null,
    proofUrl: null,
    notes: null,
    submittedAt: String(row.submitted_at),
    confirmedAt: text(row.confirmed_at),
    chargeTypeName: text(row.charge_type_name),
    chargeTypeCode: text(row.charge_type_code),
  };
}

function mapReview(row: unknown): CustomerBookingReview | null {
  if (!row || typeof row !== "object") return null;
  const review = row as Json;
  return {
    id: String(review.id),
    rating: num(review.rating),
    body: text(review.body),
    reviewerName: text(review.reviewer_name),
    isPublished: review.is_published === true,
    createdAt: String(review.created_at),
  };
}

/**
 * One booking for the signed-in renter who owns it, or null (not theirs, or
 * not found). get_my_booking applies the same ownership rule as the account
 * list, so a guessed id shows nothing.
 */
export async function getMyBooking(rentalId: string): Promise<CustomerBookingDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_booking", { p_rental_id: rentalId });
  if (error) {
    console.error("get_my_booking failed", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const row = data as Json;
  const id = String(row.id);
  const vehicle = (row.vehicle ?? {}) as Json;
  const customer = (row.customer ?? {}) as Json;
  const payments = (Array.isArray(row.payments) ? row.payments : []).map((payment) =>
    mapPayment(id, payment as Json),
  );
  const daily = num(row.quoted_daily_rate);
  const withDriver = row.with_driver === true;
  const pickupMethod = parseHandoverMethod(row.pickup_method);
  const returnMethod = parseHandoverMethod(row.return_method);
  const pickupDeliveryFee = num(row.pickup_delivery_fee) ?? 0;
  const returnDeliveryFee = num(row.return_delivery_fee) ?? 0;

  return {
    id,
    referenceNumber: String(row.reference_number),
    status: row.status as CustomerBookingStatus,
    paymentStatus: (row.payment_status as RentalPaymentStatus) ?? "unpaid",
    bookedOnline: row.booking_source === "public_web",
    createdAt: String(row.created_at),
    startAt: String(row.start_at),
    expectedReturnAt: String(row.expected_return_at),
    actualReturnAt: text(row.actual_return_at),
    pickupLocation: text(row.pickup_location),
    returnLocation: text(row.return_location),
    pickupMethod,
    returnMethod,
    pickupDeliveryFee,
    returnDeliveryFee,
    quotedTotal: num(row.quoted_total) ?? 0,
    destination: text(row.destination),
    passengerCount: num(row.passenger_count),
    withDriver,
    depositAmount: num(row.deposit_amount),
    cancelledAt: text(row.cancelled_at),
    cancellationReason: text(row.cancellation_reason),
    reservationFeeForfeited:
      typeof row.reservation_fee_forfeited === "boolean" ? row.reservation_fee_forfeited : null,
    termsVersion: text(row.terms_version),
    termsAcceptedAt: text(row.terms_accepted_at),
    freeCancellationHours: num(row.free_cancellation_hours),
    detailsEditable: row.details_editable === true,
    vehicle: {
      id: String(vehicle.id),
      name: text(vehicle.name) ?? "Vehicle",
      make: text(vehicle.make),
      model: text(vehicle.model),
      year: num(vehicle.year),
      plateNumber: text(vehicle.plate_number),
      photoUrl: text(vehicle.photo_url),
      transmission: text(vehicle.transmission),
      seatingCapacity: num(vehicle.seating_capacity),
    },
    customer: {
      fullName: text(customer.full_name),
      phoneNumber: text(customer.phone_number),
      email: text(customer.email),
      address: text(customer.address),
      facebookAccount: text(customer.facebook_account),
      driversLicenseNumber: text(customer.drivers_license_number),
    },
    bill: buildRentalBill({
      // Customers see per-day pricing only; the 12-hour and hourly rates are staff's.
      quotedRates: daily != null ? { daily } : null,
      quotedDays: num(row.quoted_days),
      quotedHours: num(row.quoted_hours),
      quotedTotal: num(row.quoted_total),
      driver: withDriver
        ? {
            fee: num(row.driver_fee) ?? 0,
            rate: num(row.driver_daily_rate),
            days: num(row.driver_days),
          }
        : null,
      handover: {
        pickupMethod,
        returnMethod,
        pickupFee: pickupDeliveryFee,
        returnFee: returnDeliveryFee,
      },
      bookingFees: parseBookingFees(row.booking_fees),
      payments,
    }),
    payments,
    review: mapReview(row.review),
  };
}
