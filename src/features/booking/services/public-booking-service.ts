import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { PublicBookingInput } from "@/features/booking/schemas/public-booking-schema";
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
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { uploadPaymentProof } from "@/features/booking/lib/upload-payment-proof";

function toTimestamptz(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Enter valid pick-up and return dates.");
  }
  return date.toISOString();
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapPaymentDetails(row: Record<string, unknown>): BookingPaymentDetails {
  return {
    rentalId: String(row.rental_id),
    organizationId: String(row.organization_id),
    referenceNumber: String(row.reference_number),
    status: String(row.status),
    startAt: String(row.start_at),
    expectedReturnAt: String(row.expected_return_at),
    quotedDailyRate: num(row.quoted_daily_rate),
    quotedDays: num(row.quoted_days, 1),
    quotedTotal: num(row.quoted_total),
    depositPercent: num(row.deposit_percent, 30),
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
    organizationName: String(row.organization_name ?? ""),
  };
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
    status: row.status,
  };
}

export async function createPublicBooking(
  input: PublicBookingInput,
): Promise<PublicBookingResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Booking is unavailable until Supabase is configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_booking", {
    p_vehicle_id: input.vehicleId,
    p_start_at: toTimestamptz(input.startAt),
    p_expected_return_at: toTimestamptz(input.expectedReturnAt),
    p_full_name: input.fullName,
    p_phone_number: input.phoneNumber,
    p_email: input.email || null,
    p_drivers_license_number: input.driversLicenseNumber,
    p_pickup_location: input.pickupLocation || null,
    p_return_location: input.returnLocation || null,
    p_notes: input.notes || null,
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
      typeof payload.vehicle_name === "string" ? payload.vehicle_name : undefined,
    startAt: String(payload.start_at ?? input.startAt),
    expectedReturnAt: String(payload.expected_return_at ?? input.expectedReturnAt),
    quotedDailyRate: num(payload.quoted_daily_rate),
    quotedDays: num(payload.quoted_days, 1),
    quotedTotal: num(payload.quoted_total),
    depositPercent: num(payload.deposit_percent, 30),
    depositAmount: num(payload.deposit_amount),
    balanceDue: num(payload.balance_due),
    paymentStatus: (payload.payment_status as RentalPaymentStatus) || "unpaid",
    message:
      typeof payload.message === "string"
        ? payload.message
        : "Booking received. Pay the deposit and upload your proof to confirm.",
  };

  const payUrl = `${siteUrl()}/book/pay/${result.rentalId}?ref=${encodeURIComponent(result.referenceNumber)}`;
  void notifyOwnerTelegram({
    text: [
      "New booking — awaiting deposit",
      `Ref: ${result.referenceNumber}`,
      `Car: ${result.vehicleName ?? result.vehicleId}`,
      `Deposit: ${formatPhp(result.depositAmount)} (${result.depositPercent}%)`,
      `Total: ${formatPhp(result.quotedTotal)} · ${result.quotedDays} day(s)`,
      `Customer: ${input.fullName} · ${input.phoneNumber}`,
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
    throw new Error("Payment upload is unavailable until Supabase is configured.");
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
  if (!details.organizationId) {
    throw new Error(
      "Payment setup is incomplete. Please contact support with your booking reference.",
    );
  }

  const supabase = await createClient();
  const path = await uploadPaymentProof({
    supabase,
    organizationId: details.organizationId,
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
    referenceNumber: String(
      payload.reference_number ?? input.referenceNumber,
    ),
    paymentStatus:
      (payload.payment_status as RentalPaymentStatus) || "proof_submitted",
    message:
      typeof payload.message === "string"
        ? payload.message
        : "Payment proof received. We will confirm your reservation shortly.",
  };
}
