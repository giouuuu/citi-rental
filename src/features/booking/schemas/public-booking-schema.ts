import { z } from "zod";

export const publicBookingSchema = z
  .object({
    vehicleId: z.uuid("Select a vehicle to book."),
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
    pickupLocation: z
      .string()
      .trim()
      .max(200, "Pick-up location must be 200 characters or fewer.")
      .optional(),
    returnLocation: z
      .string()
      .trim()
      .max(200, "Return location must be 200 characters or fewer.")
      .optional(),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be 2000 characters or fewer.")
      .optional(),
  })
  .superRefine((value, context) => {
    const start = new Date(value.startAt);
    const end = new Date(value.expectedReturnAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
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
  });

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
