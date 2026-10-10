"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/shared/types/resource";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { publicBookingSchema } from "@/features/booking/schemas/public-booking-schema";
import { createPublicBooking } from "@/features/booking/services/public-booking-service";
import type { PublicBookingResult } from "@/features/booking/types/booking-payment";
import { recordSiteEvent } from "@/features/site-analytics/services/record-site-event";

export type CreatePublicBookingResult = ActionResult<PublicBookingResult>;

export async function createPublicBookingAction(
  formData: FormData,
): Promise<CreatePublicBookingResult> {
  // Booking needs an account; create_public_booking is closed to anon too.
  if (!(await isBookingUserSignedIn())) {
    return {
      success: false,
      message: "Sign in to book. Your session may have expired.",
    };
  }

  const parsed = publicBookingSchema.safeParse({
    vehicleId: formData.get("vehicleId"),
    drivingMode: formData.get("drivingMode") || undefined,
    startAt: formData.get("startAt"),
    expectedReturnAt: formData.get("expectedReturnAt"),
    fullName: formData.get("fullName") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    email: formData.get("email") || undefined,
    driversLicenseNumber: formData.get("driversLicenseNumber") ?? "",
    address: formData.get("address") ?? "",
    facebookAccount: formData.get("facebookAccount") ?? "",
    pickupLocation: formData.get("pickupLocation") ?? "",
    returnLocation: formData.get("returnLocation") ?? "",
    destination: formData.get("destination") ?? "",
    passengerCount: formData.get("passengerCount") ?? "",
    licenseSelfie: formData.get("licenseSelfie"),
    governmentId: formData.get("governmentId"),
    notes: formData.get("notes") || undefined,
    acceptTerms: formData.get("acceptTerms"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const booking = await createPublicBooking({
      ...parsed.data,
      email: parsed.data.email || undefined,
    });
    await recordSiteEvent({
      type: "booking_submit",
      path: `/book/${booking.vehicleId}`,
      vehicleId: booking.vehicleId,
      rentalId: booking.rentalId,
    });
    // The landing's booking reminder card reads this booking.
    revalidatePath("/");
    return { success: true, data: booking };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "We could not complete your booking. Please try again.",
    };
  }
}
