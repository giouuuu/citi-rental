import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingDetailsInput,
  PublicBookingInput,
} from "@/features/booking/schemas/public-booking-schema";
import type {
  BookingPaymentDetails,
  PublicBookingResult,
  RentalPaymentStatus,
} from "@/features/booking/types/booking-payment";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  optionalRate,
  parseVehicleBookingCharges,
} from "@/features/vehicles/lib/driving-mode-pricing";
import {
  notifyOwnerTelegram,
  siteUrl,
} from "@/features/booking/lib/notify-owner-telegram";
import { parseManilaTimestamp } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { uploadPaymentProof } from "@/features/booking/lib/upload-payment-proof";
import { bookingPaymentStep } from "@/features/booking/lib/booking-payment-step";
import { uploadBookingIdPhotos } from "@/features/booking/lib/upload-booking-id-photos";
import {
  type AgreementTemplate,
  AGREEMENT_TEMPLATE_VERSION,
} from "@/features/agreements/lib/agreement-template";
import { parseAgreementTemplate } from "@/features/agreements/schemas/agreement-template-schema";
import { parseBookingFees } from "@/features/booking/lib/booking-fees";
import {
  type DeliveryFees,
  handoverBillLine,
  parseHandoverMethod,
} from "@/features/booking/lib/handover";
import {
  type DriverTerms,
  NO_DRIVER_TERMS,
} from "@/features/booking/lib/driver-terms";

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
  const withDriver = row.with_driver === true;
  return {
    rentalId: String(row.rental_id),
    referenceNumber: String(row.reference_number),
    status: String(row.status),
    startAt: String(row.start_at),
    expectedReturnAt: String(row.expected_return_at),
    quotedDailyRate: num(row.quoted_daily_rate),
    quotedDays: num(row.quoted_days, 1),
    quotedHours: optionalNum(row.quoted_hours),
    quotedTotal: num(row.quoted_total),
    driver: withDriver
      ? {
          fee: num(row.driver_fee),
          rate: optionalNum(row.driver_daily_rate),
          days: optionalNum(row.driver_days),
        }
      : null,
    handover: {
      pickupMethod: parseHandoverMethod(row.pickup_method),
      returnMethod: parseHandoverMethod(row.return_method),
      pickupFee: num(row.pickup_delivery_fee),
      returnFee: num(row.return_delivery_fee),
    },
    bookingFees: parseBookingFees(row.booking_fees),
    pickupLocation:
      typeof row.pickup_location === "string" ? row.pickup_location : null,
    returnLocation:
      typeof row.return_location === "string" ? row.return_location : null,
    carWashFee: optionalNum(row.car_wash_fee),
    depositAmount: num(row.deposit_amount),
    balanceDue: num(row.balance_due),
    paymentStatus: (row.payment_status as RentalPaymentStatus) || "unpaid",
    paymentKind:
      row.payment_kind === "reservation_fee" || row.payment_kind === "open_bill"
        ? row.payment_kind
        : null,
    billTotal: num(row.bill_total, num(row.quoted_total)),
    amountPaid: num(row.amount_paid),
    pendingPaymentAmount: num(row.pending_payment_amount),
    paymentReference:
      typeof row.payment_reference === "string" ? row.payment_reference : null,
    hasPaymentProof: Boolean(row.has_payment_proof),
    paymentProofSubmittedAt:
      typeof row.payment_proof_submitted_at === "string"
        ? row.payment_proof_submitted_at
        : null,
    depositPending: row.deposit_payment_status === "submitted",
    datesTaken: Boolean(row.dates_taken),
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
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    reservationFeeForfeited:
      typeof row.reservation_fee_forfeited === "boolean"
        ? row.reservation_fee_forfeited
        : null,
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

/** The owner's driver day rate, the hours it covers, and overtime. Cached per request. */
export const getPublicDriverTerms = cache(
  async function getPublicDriverTerms(): Promise<DriverTerms> {
    if (!isSupabaseConfigured()) return NO_DRIVER_TERMS;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_driver_terms");
    if (error || !data) {
      if (error) console.error("get_public_driver_terms failed", error.message);
      return NO_DRIVER_TERMS;
    }
    const row = data as Record<string, unknown>;
    // Zero reads as unset, like an empty Settings field.
    const positive = (value: unknown) => {
      const amount = optionalNum(value);
      return amount != null && amount > 0 ? amount : null;
    };
    const hours = Number(row.hours_per_day);
    return {
      dailyRate: positive(row.daily_rate),
      hoursPerDay:
        Number.isInteger(hours) && hours > 0 ? hours : NO_DRIVER_TERMS.hoursPerDay,
      overtimeRate: positive(row.overtime_hourly_rate),
    };
  },
);

export type PublicBookingFees = {
  /** Settings → per-way delivery fees. */
  delivery: DeliveryFees;
  /** Settings → operating address, where office pick-ups happen. */
  officeAddress: string | null;
};

const NO_BOOKING_FEES: PublicBookingFees = {
  delivery: { withinCity: null, outsideCity: null },
  officeAddress: null,
};

/** The fees a customer sees while booking. Cached per request. */
export const getPublicBookingFees = cache(
  async function getPublicBookingFees(): Promise<PublicBookingFees> {
    if (!isSupabaseConfigured()) return NO_BOOKING_FEES;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_booking_fees");
    if (error || !data) {
      if (error) console.error("get_public_booking_fees failed", error.message);
      return NO_BOOKING_FEES;
    }
    const row = data as Record<string, unknown>;
    return {
      delivery: {
        withinCity: optionalNum(row.delivery_fee_within_city),
        outsideCity: optionalNum(row.delivery_fee_outside_city),
      },
      officeAddress:
        typeof row.office_address === "string" ? row.office_address : null,
    };
  },
);

/** Hours before pickup a booking can be cancelled with the fee refunded. */
export async function getPublicFreeCancellationHours(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_public_free_cancellation_hours",
  );
  if (error) {
    console.error("get_public_free_cancellation_hours failed", error.message);
    return null;
  }
  const hours = Number(data);
  return data != null && Number.isInteger(hours) && hours >= 0 ? hours : null;
}

/**
 * The rental agreement wording saved in Settings, for the booking form's
 * terms. A null template means the built-in one. Cached per request: the
 * page shows it and the booking records its version.
 */
export const getPublicAgreementTemplate = cache(
  async function getPublicAgreementTemplate(): Promise<{
    template: AgreementTemplate | null;
    version: string;
  }> {
    const fallback = { template: null, version: AGREEMENT_TEMPLATE_VERSION };
    if (!isSupabaseConfigured()) return fallback;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_agreement_template");
    if (error) {
      console.error("get_public_agreement_template failed", error.message);
      return fallback;
    }
    const row = (data ?? {}) as { template?: unknown; version?: string | null };
    const template = parseAgreementTemplate(row.template);
    return template && row.version
      ? { template, version: row.version }
      : fallback;
  },
);

/** Cached per request: page metadata and the page body both read it. */
export const getPublicVehicle = cache(async function getPublicVehicle(
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
    with_driver_daily_rate: optionalRate(row.with_driver_daily_rate),
    booking_charges: parseVehicleBookingCharges(row.booking_charges),
    color: row.color ?? null,
    showcase_image_url: row.showcase_image_url ?? null,
    status: row.status,
  };
});

export async function createPublicBooking(
  input: PublicBookingInput,
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
  const { version: termsVersion } = await getPublicAgreementTemplate();
  const { data, error } = await supabase.rpc("create_public_booking", {
    p_vehicle_id: input.vehicleId,
    p_start_at: startAt,
    p_expected_return_at: expectedReturnAt,
    p_full_name: input.fullName || null,
    p_phone_number: input.phoneNumber || null,
    p_email: input.email || null,
    // The renter only drives on self-drive; with a driver there is no license to send.
    p_drivers_license_number:
      input.drivingMode === "with-driver"
        ? null
        : input.driversLicenseNumber || null,
    // At the office the database fills in the office address.
    p_pickup_location:
      input.pickupMethod === "office" ? null : input.pickupLocation,
    p_return_location:
      input.returnMethod === "office" ? null : input.returnLocation,
    p_pickup_method: input.pickupMethod,
    p_return_method: input.returnMethod,
    p_notes: input.notes || null,
    p_address: input.address || null,
    p_facebook_account: input.facebookAccount || null,
    p_destination: input.destination,
    p_passenger_count: input.passengerCount,
    p_license_selfie_path: licenseSelfiePath,
    p_government_id_path: governmentIdPath,
    // Only sent when asked for: self-drive bookings work against a database
    // that predates the driver option.
    ...(input.drivingMode === "with-driver" ? { p_with_driver: true } : {}),
    // The schema only passes a booking whose terms were ticked.
    p_terms_version: termsVersion,
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
    quotedDays: num(payload.quoted_days, 1),
    quotedHours: optionalNum(payload.quoted_hours),
    quotedTotal: num(payload.quoted_total),
    withDriver: payload.with_driver === true,
    driverFee: num(payload.driver_fee),
    pickupLocation:
      typeof payload.pickup_location === "string"
        ? payload.pickup_location
        : input.pickupLocation,
    handover: {
      pickupMethod: parseHandoverMethod(payload.pickup_method),
      returnMethod: parseHandoverMethod(payload.return_method),
      pickupFee: num(payload.pickup_delivery_fee),
      returnFee: num(payload.return_delivery_fee),
    },
    bookingFees: parseBookingFees(payload.booking_fees),
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
      result.withDriver
        ? `WITH DRIVER: ${result.driverFee > 0 ? `${formatPhp(result.driverFee)} included` : "fee to quote"}`
        : "Self-drive",
      ...handoverTelegramLines(result.handover, result.withDriver),
      ...result.bookingFees.map((fee) => `${fee.name}: ${formatPhp(fee.amount)}`),
      `Trip: ${input.pickupMethod === "office" ? "Office pick-up" : input.pickupLocation} → ${input.destination} · ${input.passengerCount} pax`,
      input.fullName
        ? `Customer: ${input.fullName} · ${input.phoneNumber || input.email}`
        : `Returning customer: ${input.email || input.phoneNumber}`,
    ].join("\n"),
    buttons: [
      { text: "Open rental", url: `${siteUrl()}/rentals/${result.rentalId}` },
      { text: "Pay page", url: payUrl },
    ],
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

/** "Delivery: Within Cebu City · ₱300" lines for the owner's alert. */
function handoverTelegramLines(
  handover: PublicBookingResult["handover"],
  withDriver: boolean,
) {
  return [
    handoverBillLine("pickup", handover.pickupMethod, handover.pickupFee, withDriver),
    handoverBillLine("return", handover.returnMethod, handover.returnFee, withDriver),
  ].flatMap((line) =>
    line
      ? [`${line.label}: ${line.detail}${line.fee > 0 ? ` · ${formatPhp(line.fee)}` : ""}`]
      : [],
  );
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
  /** Bill payments: what the renter sent. The reservation fee ignores it. */
  amount?: number;
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
  const step = bookingPaymentStep(details);
  if (step.kind === "nothing_due") {
    throw new Error(
      details.status === "cancelled"
        ? "This booking is cancelled."
        : "Nothing is left to pay on this booking.",
    );
  }
  if (step.kind === "open_bill_sent") {
    throw new Error(
      "Your last payment is still being checked. It covers the open balance.",
    );
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
    p_amount: input.amount ?? null,
  });

  if (error) {
    throw new Error(error.message || "We could not save your payment proof.");
  }

  const payload = data as Record<string, unknown>;
  if (!payload?.success) {
    throw new Error("We could not save your payment proof. Please try again.");
  }

  const billPayment = payload.payment_kind === "open_bill";
  void notifyOwnerTelegram({
    text: [
      billPayment
        ? "Bill payment proof submitted — please verify"
        : payload.dates_taken
          ? "Payment proof submitted, but another booking already holds these dates — move dates or refund"
          : details.status === "reserved"
            ? "Reservation fee proof submitted on a reserved booking — please verify"
            : "Payment proof submitted — dates held, please verify",
      `Ref: ${payload.reference_number}`,
      `Car: ${payload.vehicle_name ?? details.vehicleName}`,
      billPayment
        ? `Amount: ${formatPhp(num(payload.amount))}`
        : num(payload.amount) > num(payload.deposit_amount, details.depositAmount)
          ? `Amount: ${formatPhp(num(payload.amount))} (reservation fee ${formatPhp(num(payload.deposit_amount, details.depositAmount))} and more)`
          : `Deposit: ${formatPhp(num(payload.deposit_amount, details.depositAmount))}`,
      `Pay ref: ${payload.payment_reference ?? input.paymentReference}`,
      `Customer: ${payload.customer_name ?? "—"} · ${payload.customer_phone ?? "—"}`,
    ].join("\n"),
    buttons: [{ text: "Open rental", url: `${siteUrl()}/rentals/${input.rentalId}` }],
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

export type CancelMyBookingResult = {
  rentalId: string;
  referenceNumber: string;
  /** Something was paid (or proof sent) before cancelling. */
  paid: boolean;
  /** Paid and cancelled inside the free-cancellation window: fee kept. */
  reservationFeeForfeited: boolean;
};

/** The signed-in owner cancels their draft or reserved booking. */
export async function cancelMyBooking(
  rentalId: string,
): Promise<CancelMyBookingResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Cancelling is unavailable until Supabase is configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_my_booking", {
    p_rental_id: rentalId,
  });

  if (error) {
    throw new Error(error.message || "We could not cancel your booking.");
  }

  const payload = data as Record<string, unknown>;
  if (!payload?.success) {
    throw new Error("We could not cancel your booking. Please try again.");
  }

  const result: CancelMyBookingResult = {
    rentalId: String(payload.rental_id),
    referenceNumber: String(payload.reference_number),
    paid: payload.paid === true,
    reservationFeeForfeited: payload.reservation_fee_forfeited === true,
  };

  void notifyOwnerTelegram({
    text: [
      "Booking cancelled by the customer",
      `Ref: ${result.referenceNumber}`,
      `Car: ${payload.vehicle_name ?? "—"}`,
      `Customer: ${payload.customer_name ?? "—"}`,
      result.paid
        ? result.reservationFeeForfeited
          ? `Reservation fee ${formatPhp(num(payload.deposit_amount))} kept (inside the free-cancellation window)`
          : `Reservation fee ${formatPhp(num(payload.deposit_amount))} to refund`
        : "Nothing was paid",
    ].join("\n"),
    buttons: [{ text: "Open rental", url: `${siteUrl()}/rentals/${result.rentalId}` }],
  }).then((notify) => {
    if (!notify.sent) {
      console.error(
        "[telegram] cancellation notify not delivered:",
        notify.reason ?? "unknown",
        { rentalId: result.rentalId },
      );
    }
  });

  return result;
}

/**
 * The signed-in owner fixes their details or trip on a booking that is not
 * paid yet. update_my_booking_details re-checks ownership and the unpaid gate.
 */
export async function updateMyBookingDetails(
  input: BookingDetailsInput,
): Promise<{ rentalId: string; referenceNumber: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Editing is unavailable until Supabase is configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_my_booking_details", {
    p_rental_id: input.rentalId,
    p_full_name: input.fullName,
    p_phone_number: input.phoneNumber,
    p_address: input.address,
    p_facebook_account: input.facebookAccount,
    p_drivers_license_number: input.driversLicenseNumber || null,
    p_pickup_location:
      input.pickupMethod === "office" ? null : input.pickupLocation,
    p_return_location:
      input.returnMethod === "office" ? null : input.returnLocation,
    p_destination: input.destination,
    p_passenger_count: input.passengerCount,
    p_pickup_method: input.pickupMethod,
    p_return_method: input.returnMethod,
  });

  if (error) {
    throw new Error(error.message || "We could not save your changes.");
  }

  const payload = data as Record<string, unknown>;
  if (!payload?.success) {
    throw new Error("We could not save your changes. Please try again.");
  }

  const result = {
    rentalId: String(payload.rental_id),
    referenceNumber: String(payload.reference_number),
  };

  void notifyOwnerTelegram({
    text: [
      "Booking details edited by the customer",
      `Ref: ${result.referenceNumber}`,
      `Car: ${payload.vehicle_name ?? "—"}`,
      `Customer: ${payload.customer_name ?? "—"} · ${payload.customer_phone ?? "—"}`,
      `Trip: ${payload.pickup_location ?? input.pickupLocation} → ${input.destination} · ${input.passengerCount} pax`,
      ...(payload.price_changed === true
        ? [`Pick-up/return changed — new total ${formatPhp(num(payload.quoted_total))}`]
        : []),
    ].join("\n"),
    buttons: [{ text: "Open rental", url: `${siteUrl()}/rentals/${result.rentalId}` }],
  }).then((notify) => {
    if (!notify.sent) {
      console.error(
        "[telegram] details edit notify not delivered:",
        notify.reason ?? "unknown",
        { rentalId: result.rentalId },
      );
    }
  });

  return result;
}
