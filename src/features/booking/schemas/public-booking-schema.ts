import { z } from "zod";

import { DRIVING_MODES } from "@/features/booking/lib/driving-mode";
import { parseManilaTimestamp } from "@/features/shared/lib/manila-time";

/** A picked image file; the server re-checks size and type before upload. */
function idPhoto(message: string) {
  return z.custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File && value.size > 0,
    message,
  );
}

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
  driversLicenseNumber: z
    .string()
    .trim()
    .min(3, "Enter your driver license number.")
    .max(80, "License number must be 80 characters or fewer."),
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
  licenseSelfie: idPhoto("Upload a selfie holding your driver's license."),
  governmentId: idPhoto("Upload a photo of another government ID."),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional(),
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

export const publicBookingSchema = bookingFields.superRefine(refineTripDates);

/**
 * Returning guest: the email or phone they looked up identifies them, and
 * create_public_booking fills name, phone, license, address and Facebook
 * from their record. Trip details and ID photos are still required.
 */
export const returningBookingSchema = bookingFields
  .extend({
    fullName: bookingFields.shape.fullName.or(z.literal("")).optional(),
    phoneNumber: bookingFields.shape.phoneNumber.or(z.literal("")).optional(),
    driversLicenseNumber: bookingFields.shape.driversLicenseNumber
      .or(z.literal(""))
      .optional(),
    address: bookingFields.shape.address.or(z.literal("")).optional(),
    facebookAccount: bookingFields.shape.facebookAccount
      .or(z.literal(""))
      .optional(),
  })
  .superRefine((value, context) => {
    refineTripDates(value, context);
    if (!value.email && !value.phoneNumber) {
      context.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter the email or mobile number you booked with before.",
      });
    }
  });

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
export type ReturningBookingInput = z.infer<typeof returningBookingSchema>;
