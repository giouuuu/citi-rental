"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { notifyOwnerTelegram, siteUrl } from "@/features/booking/lib/notify-owner-telegram";
import { bookingReviewSchema } from "@/features/booking/schemas/booking-review-schema";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { createClient } from "@/lib/supabase/server";

export async function submitBookingReviewAction(input: {
  rentalId: string;
  rating: number | string;
  body: string;
}): Promise<ActionResult> {
  // submit_my_booking_review re-checks that this account owns the booking.
  if (!(await isBookingUserSignedIn())) {
    return { success: false, message: "Sign in to review your trip." };
  }

  const parsed = bookingReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Check your review and try again.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_my_booking_review", {
    p_rental_id: parsed.data.rentalId,
    p_rating: parsed.data.rating,
    p_body: parsed.data.body,
  });
  if (error) {
    return {
      success: false,
      message: error.message || "We could not save your review. Please try again.",
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  void notifyOwnerTelegram({
    text: [
      `New ${"★".repeat(parsed.data.rating)}${"☆".repeat(5 - parsed.data.rating)} review from ${payload.reviewer_name ?? "a renter"}`,
      `Ref: ${payload.reference_number ?? "—"} · ${payload.vehicle_name ?? "—"}`,
      `“${parsed.data.body.slice(0, 300)}”`,
      `Publish it: ${siteUrl()}/reviews`,
    ].join("\n"),
  });

  revalidatePath("/account");
  revalidatePath(`/account/bookings/${parsed.data.rentalId}`);
  revalidateResource("/reviews");
  return { success: true };
}
