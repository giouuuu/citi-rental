import { z } from "zod";

/** Same limits as submit_my_booking_review. */
export const BOOKING_REVIEW_MAX_LENGTH = 2000;

export const bookingReviewSchema = z.object({
  rentalId: z.uuid("Invalid booking."),
  rating: z.coerce
    .number("Choose 1 to 5 stars.")
    .int("Choose 1 to 5 stars.")
    .min(1, "Choose 1 to 5 stars.")
    .max(5, "Choose 1 to 5 stars."),
  body: z
    .string()
    .trim()
    .min(3, "Tell us a little about your trip.")
    .max(BOOKING_REVIEW_MAX_LENGTH, "Keep your review under 2,000 characters."),
});

export type BookingReviewInput = z.infer<typeof bookingReviewSchema>;
