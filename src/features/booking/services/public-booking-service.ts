import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type {
  PublicBookingInput,
  ReturningBookingInput,
} from "@/features/booking/schemas/public-booking-schema";
import type {
  BookingPaymentDetails,
  PublicBookingResult,
  RentalPaymentStatus,
} from "@/features/booking/types/booking-payment";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  notifyOwnerTelegram,
  siteUrl,
} from "@/features/booking/lib/notify-owner-telegram";
import { parseManilaTimestamp } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { uploadPaymentProof } from "@/features/booking/lib/upload-payment-proof";
import { uploadBookingIdPhotos } from "@/features/booking/lib/upload-booking-id-photos";

function toTimestamptz(value: string) {
  const date = parseManilaTimestamp(value);
  if (!date) {
    throw new Error("Enter valid pick-up and return dates.");
  }
  return date.toISOString();
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown) {
  return value == null ? null : num(value);
}

function mapPaymentDetails(
  row: Record<string, unknown>,
): BookingPaymentDetails {
  return {
    rentalId: String(row.rental_id),
    referenceNumber: String(row.reference_number),
    status: String(row.status),
    startAt: String(row.start_at),
    expectedReturnAt: String(row.expected_return_at),
    quotedDailyRate: num(row.quoted_daily_rate),
    quotedHalfDayRate: optionalNum(row.quoted_half_day_rate),
    quotedHourlyRate: optionalNum(row.quoted_hourly_rate),
    quotedDays: num(row.quoted_days, 1),
    quotedHours: optionalNum(row.quoted_hours),
    quotedTotal: num(row.quoted_total),
    depositAmount: num(row.deposit_amount),
    balanceDue: num(row.balance_due),
    paymentStatus: (row.payment_status as RentalPaymentStatus) || "unpaid",
    paymentReference:
      typeof row.payment_reference === "string" ? row.payment_reference : null,
    hasPaymentProof: Boolean(row.has_payment_proof),
    paymentProofSubmittedAt:
      typeof row.payment_proof_submitted_at === "string"
        ? row.payment_proof_submitted_at
        : null,
    vehicleName: String(row.vehicle_name ?? ""),
    vehicleMake: String(row.vehicle_make ?? ""),
    vehicleModel: String(row.vehicle_model ?? ""),
    paymentQrUrl:
      typeof row.payment_qr_url === "string" ? row.payment_qr_url : null,
    paymentInstructions:
      typeof row.payment_instructions === "string"
        ? row.payment_instructions
        : null,
    companyName: String(row.company_name ?? ""),
  };
}

/** The flat fee an online booking pays to hold the car. Null when unknown. */
export async function getPublicReservationFee(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_reservation_fee");
  if (error) {
    console.error("get_public_reservation_fee failed", error.message);
    return null;
  }
  const fee = Number(data);
  return Number.isFinite(fee) && fee > 0 ? fee : null;
}

export async function getPublicVehicle(
  vehicleId: string,
): Promise<(PublicFleetVehicle & { status: string }) | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_vehicle", {
    p_vehicle_id: vehicleId,
  });

  if (error || !data?.length) return null;
  const row = data[0];
  return {
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: Number(row.year),
    category: row.category,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    seating_capacity: row.seating_capacity,
    photo_url: row.photo_url,
    daily_rate: Number(row.daily_rate),
    half_day_rate: row.half_day_rate != null ? Number(row.half_day_rate) : null,
    hourly_rate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    color: row.color ?? null,
    showcase_image_url: row.showcase_image_url ?? null,
    status: row.status,
  };
}

export async function createPublicBooking(
  input: PublicBookingInput | ReturningBookingInput,
): Promise<PublicBookingResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Booking is unavailable until Supabase is configured.");
  }

  const startAt = toTimestamptz(input.startAt);
  const expectedReturnAt = toTimestamptz(input.expectedReturnAt);
  const supabase = await createClient();
  const { licenseSelfiePath, governmentIdPath } = await uploadBookingIdPhotos({
    supabase,
    photos: {
      licenseSelfie: input.licenseSelfie,
      governmentId: input.governmentId,
    },
  });
  const { data, error } = await supabase.rpc("create_public_booking", {
    p_vehicle_id: input.vehicleId,
    p_start_at: startAt,
    p_expected_return_at: expectedReturnAt,
    p_full_name: input.fullName || null,
    p_phone_number: input.phoneNumber || null,
    p_email: input.email || null,
    p_drivers_license_number: input.driversLicenseNumber || null,
    p_pickup_location: input.pickupLocation,
    p_return_location: input.returnLocation,
    p_notes: input.notes || null,
    p_address: input.address || null,
    p_facebook_account: input.facebookAccount || null,
    p_destination: input.destination,
    p_passenger_count: input.passengerCount,
    p_license_selfie_path: licenseSelfiePath,
    p_government_id_path: governmentIdPath,
  });

  if (error) {
    throw new Error(error.message || "We could not complete your booking.");
  }

  const payload = data as Record<string, unknown>;
  if (!payload?.success || !payload.rental_id || !payload.reference_number) {
    throw new Error("We could not complete your booking. Please try again.");
  }

  const result: PublicBookingResult = {
    rentalId: String(payload.rental_id),
    referenceNumber: String(payload.reference_number),
    vehicleId: String(payload.vehicle_id ?? input.vehicleId),
    vehicleName:
      typeof payload.vehicle_name === "string"
        ? payload.vehicle_name
        : undefined,
    startAt: String(payload.start_at ?? input.startAt),
    expectedReturnAt: String(
      payload.expected_return_at ?? input.expectedReturnAt,
    ),
    quotedDailyRate: num(payload.quoted_daily_rate),
    quotedHalfDayRate: optionalNum(payload.quoted_half_day_rate),
    quotedHourlyRate: optionalNum(payload.quoted_hourly_rate),
    quotedDays: num(payload.quoted_days, 1),
    quotedHours: optionalNum(payload.quoted_hours),
    quotedTotal: num(payload.quoted_total),
    depositAmount: num(payload.deposit_amount),
    balanceDue: num(payload.balance_due),
    paymentStatus: (payload.payment_status as RentalPaymentStatus) || "unpaid",
    message:
      typeof payload.message === "string"
        ? payload.message
        : "Booking received. Pay the reservation fee and upload your proof to confirm.",
  };

  const payUrl = `${siteUrl()}/book/pay/${result.rentalId}?ref=${encodeURIComponent(result.referenceNumber)}`;
  void notifyOwnerTelegram({
    text: [
      "New booking — awaiting reservation fee",
      `Ref: ${result.referenceNumber}`,
      `Car: ${result.vehicleName ?? result.vehicleId}`,
      `Reservation fee: ${formatPhp(result.depositAmount)}`,
      `Total: ${formatPhp(result.quotedTotal)} · ${result.quotedDays} day(s)`,
      `Trip: ${input.pickupLocation} → ${input.destination} · ${input.passengerCount} pax`,
      input.fullName
        ? `Customer: ${input.fullName} · ${input.phoneNumber || input.email}`
        : `Returning customer: ${input.email || input.phoneNumber}`,
      `Pay page: ${payUrl}`,
      `Ops: ${siteUrl()}/rentals/${result.rentalId}`,
    ].join("\n"),
  }).then((notify) => {
    if (!notify.sent) {
      console.error(
        "[telegram] booking notify not delivered:",
        notify.reason ?? "unknown",
        { rentalId: result.rentalId, referenceNumber: result.referenceNumber },
      );
    }
  });

  return result;
}

export async function getBookingPaymentDetails(
  rentalId: string,
  referenceNumber: string,
): Promise<BookingPaymentDetails | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_booking_payment_details", {
    p_rental_id: rentalId,
    p_reference_number: referenceNumber,
  });

  if (error || !data) {
    console.error("get_booking_payment_details failed", error?.message);
    return null;
  }

  return mapPaymentDetails(data as Record<string, unknown>);
}

export async function submitBookingPaymentProof(input: {
  rentalId: string;
  referenceNumber: string;
  paymentReference: string;
  proof: File;
}): Promise<{
  rentalId: string;
  referenceNumber: string;
  paymentStatus: RentalPaymentStatus;
  message: string;
}> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Payment upload is unavailable until Supabase is configured.",
    );
  }

  const details = await getBookingPaymentDetails(
    input.rentalId,
    input.referenceNumber,
  );
  if (!details) {
    throw new Error("Booking not found. Check your reference number.");
  }
  if (details.status !== "draft") {
    throw new Error("This booking is already confirmed or closed.");
  }
  const supabase = await createClient();
  const path = await uploadPaymentProof({
    supabase,
    rentalId: input.rentalId,
    file: input.proof,
  });

  const { data, error } = await supabase.rpc("submit_booking_payment_proof", {
    p_rental_id: input.rentalId,
    p_reference_number: input.referenceNumber,
    p_payment_reference: input.paymentReference,
    p_proof_path: path,
  });

  if (error) {
    throw new Error(error.message || "We could not save your payment proof.");
  }

  const payload = data as Record<string, unknown>;
  if (!payload?.success) {
    throw new Error("We could not save your payment proof. Please try again.");
  }

  void notifyOwnerTelegram({
    text: [
      "Payment proof submitted — please verify",
      `Ref: ${payload.reference_number}`,
      `Car: ${payload.vehicle_name ?? details.vehicleName}`,
      `Deposit: ${formatPhp(num(payload.deposit_amount, details.depositAmount))}`,
      `Pay ref: ${payload.payment_reference ?? input.paymentReference}`,
      `Customer: ${payload.customer_name ?? "—"} · ${payload.customer_phone ?? "—"}`,
      `Ops: ${siteUrl()}/rentals/${input.rentalId}`,
    ].join("\n"),
  }).then((notify) => {
    if (!notify.sent) {
      console.error(
        "[telegram] payment-proof notify not delivered:",
        notify.reason ?? "unknown",
        { rentalId: input.rentalId, referenceNumber: input.referenceNumber },
      );
    }
  });

  return {
    rentalId: String(payload.rental_id ?? input.rentalId),
    referenceNumber: String(payload.reference_number ?? input.referenceNumber),
    paymentStatus:
      (payload.payment_status as RentalPaymentStatus) || "proof_submitted",
    message:
      typeof payload.message === "string"
        ? payload.message
        : "Payment proof received. We will confirm your reservation shortly.",
  };
}
