import { z } from "zod";

import { manilaDateKey } from "@/features/shared/lib/manila-time";

/** Philippine calendar day as yyyy-MM-dd (string-comparable). */
export function todayDateValue(now = new Date()): string {
  return manilaDateKey(now);
}

export const bookingSearchSchema = z
  .object({
    pickupLocation: z.string().trim().min(1, "Enter a pick-up location."),
    pickupDate: z.string().min(1, "Choose a pick-up date."),
    returnDate: z.string().min(1, "Choose a return date."),
  })
  .superRefine((values, context) => {
    const today = todayDateValue();

    if (values.pickupDate && values.pickupDate < today) {
      context.addIssue({
        code: "custom",
        path: ["pickupDate"],
        message: "Pick-up must be today or a future date.",
      });
    }

    if (values.pickupDate && values.returnDate && values.returnDate < values.pickupDate) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "Return date must be on or after pick-up.",
      });
    }
  });

export type BookingSearchInput = z.infer<typeof bookingSearchSchema>;
