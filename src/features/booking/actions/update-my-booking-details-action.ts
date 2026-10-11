"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import {
  bookingDetailsSchema,
  type BookingDetailsInput,
} from "@/features/booking/schemas/public-booking-schema";
import { updateMyBookingDetails } from "@/features/booking/services/public-booking-service";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";

export async function updateMyBookingDetailsAction(
  input: z.input<typeof bookingDetailsSchema>,
): Promise<ActionResult> {
  // update_my_booking_details re-checks ownership and that nothing is paid.
  if (!(await isBookingUserSignedIn())) {
    return { success: false, message: "Sign in to edit your booking." };
  }

  const parsed = bookingDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Check the highlighted fields and try again.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  let result: Awaited<ReturnType<typeof updateMyBookingDetails>>;
  try {
    result = await updateMyBookingDetails(parsed.data satisfies BookingDetailsInput);
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "We could not save your changes. Please try again.",
    };
  }

  revalidatePath("/account");
  revalidatePath(`/account/bookings/${result.rentalId}`);
  revalidatePath(`/book/pay/${result.rentalId}`);
  revalidateResource("/rentals");
  revalidateResource("/customers");
  return { success: true };
}
