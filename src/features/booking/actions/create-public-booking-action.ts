"use server";

import type { ActionResult } from "@/features/shared/types/resource";
import { publicBookingSchema } from "@/features/booking/schemas/public-booking-schema";
import {
  createPublicBooking,
} from "@/features/booking/services/public-booking-service";
import type { PublicBookingResult } from "@/features/booking/types/booking-payment";

export type CreatePublicBookingResult = ActionResult<PublicBookingResult>;

export async function createPublicBookingAction(
  formData: FormData,
): Promise<CreatePublicBookingResult> {
  const parsed = publicBookingSchema.safeParse({
    vehicleId: formData.get("vehicleId"),
    startAt: formData.get("startAt"),
    expectedReturnAt: formData.get("expectedReturnAt"),
    fullName: formData.get("fullName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email") || undefined,
    driversLicenseNumber: formData.get("driversLicenseNumber"),
    pickupLocation: formData.get("pickupLocation") || undefined,
    returnLocation: formData.get("returnLocation") || undefined,
    notes: formData.get("notes") || undefined,
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
