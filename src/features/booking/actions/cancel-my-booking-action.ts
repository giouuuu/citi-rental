"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/features/shared/types/resource";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import {
  cancelMyBooking,
  type CancelMyBookingResult,
} from "@/features/booking/services/public-booking-service";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export type CancelMyBookingActionResult = ActionResult<CancelMyBookingResult>;

const rentalIdSchema = z.uuid("Invalid booking.");

export async function cancelMyBookingAction(
  rentalId: string,
): Promise<CancelMyBookingActionResult> {
  // cancel_my_booking re-checks that this account owns the booking.
  if (!(await isBookingUserSignedIn())) {
    return {
      success: false,
      message: "Sign in to cancel your booking.",
    };
  }

  const parsed = rentalIdSchema.safeParse(rentalId);
  if (!parsed.success) {
    return { success: false, message: "Invalid booking." };
  }

  try {
    const result = await cancelMyBooking(parsed.data);
    // The landing reminder, the account page, this pay page and ops lists.
    revalidatePath("/");
    revalidatePath("/account");
    revalidatePath(`/account/bookings/${result.rentalId}`);
    revalidatePath(`/book/pay/${result.rentalId}`);
    revalidateResource("/rentals");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "We could not cancel your booking. Please try again.",
    };
  }
}
