import { z } from "zod";

import { DRIVING_MODES } from "@/features/booking/lib/driving-mode";
import { parseManilaTimestamp } from "@/features/shared/lib/manila-time";

/** A picked image file; the server re-checks size and type before upload. */
function isPhoto(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

/**
 * The renter drives on self-drive, so they show their driver's license. With
 * a driver they only prove who they are: a government ID and a selfie holding
 * it. Same two photo slots either way.
 */
export const idPhotoCopy = {
  "self-drive": {
    selfieLabel: "Selfie with driver's license",
    selfieDescription: "A clear selfie of you holding your driver's license.",
    selfieMissing: "Upload a selfie holding your driver's license.",
    idLabel: "Another government ID",
    idDescription: "Passport, UMID, PhilSys, SSS, or another government ID.",
    idMissing: "Upload a photo of another government ID.",
  },
  "with-driver": {
    selfieLabel: "Selfie with government ID",
    selfieDescription: "A clear selfie of you holding that same government ID.",
    selfieMissing: "Upload a selfie holding your government ID.",
    idLabel: "Government ID",
    idDescription: "Passport, UMID, PhilSys, SSS, driver's license, or another government ID.",
    idMissing: "Upload a photo of your government ID.",
  },
} as const;

/**
 * Any value passes here; refineRenterIds rejects a missing photo with a
 * message for the driving choice. Typed File because it is one once that
 * check has passed.
 */
const renterPhoto = z
  .custom<File>(() => true)
  .optional()
  .transform((value) => value as File);

const bookingFields = z.object({
  vehicleId: z.uuid("Select a vehicle to book."),
  drivingMode: z.enum(DRIVING_MODES).default("self-drive"),
  startAt: z.string().min(1, "Pick-up date is required."),
  expectedReturnAt: z.string().min(1, "Return date is required."),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Full name must be 120 characters or fewer."),
  phoneNumber: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(40, "Phone number must be 40 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.email("Enter a valid email address.").optional()),
  // Required on self-drive only; see refineRenterIds.
  driversLicenseNumber: z
    .string()
    .trim()
    .max(80, "License number must be 80 characters or fewer.")
    .optional(),
  address: z
    .string()
    .trim()
    .min(5, "Enter your complete address.")
    .max(300, "Address must be 300 characters or fewer."),
  facebookAccount: z
    .string()
    .trim()
    .min(2, "Enter your Facebook name or profile link.")
    .max(200, "Facebook account must be 200 characters or fewer."),
  pickupLocation: z
    .string()
    .trim()
    .min(1, "Enter the pick-up or delivery location.")
    .max(200, "Pick-up location must be 200 characters or fewer."),
  returnLocation: z
    .string()
    .trim()
    .min(1, "Enter the return location.")
    .max(200, "Return location must be 200 characters or fewer."),
  destination: z
    .string()
    .trim()
    .min(1, "Enter your destination.")
    .max(200, "Destination must be 200 characters or fewer."),
  passengerCount: z
    .string()
    .trim()
    .min(1, "Enter how many passengers.")
    .transform(Number)
    .pipe(
      z
        .number("Enter how many passengers.")
        .int("Enter a whole number.")
        .min(1, "Enter how many passengers.")
        .max(60, "Enter 60 passengers or fewer."),
    ),
  // Checked in refineRenterIds, whose messages follow the driving choice.
  licenseSelfie: renterPhoto,
  governmentId: renterPhoto,
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional(),
  // The checkbox in react-hook-form; valuesToFormData sends a ticked one as "on".
  acceptTerms: z.preprocess(
    (value) => value === true || value === "on",
    z.literal(true, "Read and agree to the terms and conditions to book."),
  ),
});

function refineTripDates(
  value: { startAt: string; expectedReturnAt: string },
  context: z.RefinementCtx,
) {
  const start = parseManilaTimestamp(value.startAt);
  const end = parseManilaTimestamp(value.expectedReturnAt);
  if (!start || !end) {
    context.addIssue({
      code: "custom",
      path: ["startAt"],
      message: "Enter valid pick-up and return dates.",
    });
    return;
  }
  if (end.getTime() <= start.getTime()) {
    context.addIssue({
      code: "custom",
      path: ["expectedReturnAt"],
      message: "Return must be after pick-up.",
    });
  }
  if (start.getTime() < Date.now() - 60 * 60 * 1000) {
    context.addIssue({
      code: "custom",
      path: ["startAt"],
      message: "Pick-up must be in the future.",
    });
  }
}

/**
 * Runs even when other fields failed (see `when` below), so the license and
 * photo errors show in the same pass as the rest. The value may be partly
 * invalid here, hence the defensive reads.
 */
function refineRenterIds(
  value: {
    drivingMode?: unknown;
    driversLicenseNumber?: unknown;
    licenseSelfie?: unknown;
    governmentId?: unknown;
  },
  context: z.RefinementCtx,
) {
  const withDriver = value.drivingMode === "with-driver";
  const copy = idPhotoCopy[withDriver ? "with-driver" : "self-drive"];
  const license =
    typeof value.driversLicenseNumber === "string"
      ? value.driversLicenseNumber.trim()
      : "";
  if (!withDriver && license.length < 3) {
    context.addIssue({
      code: "custom",
      path: ["driversLicenseNumber"],
      message: "Enter your driver license number.",
    });
  }
  if (!isPhoto(value.licenseSelfie)) {
    context.addIssue({
      code: "custom",
      path: ["licenseSelfie"],
      message: copy.selfieMissing,
    });
  }
  if (!isPhoto(value.governmentId)) {
    context.addIssue({
      code: "custom",
      path: ["governmentId"],
      message: copy.idMissing,
    });
  }
}

export const publicBookingSchema = bookingFields
  .superRefine(refineTripDates)
  .superRefine(refineRenterIds, { when: () => true });

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
