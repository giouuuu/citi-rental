"use server";

import type { ActionResult } from "@/features/shared/types/resource";
import {
  publicBookingSchema,
  returningBookingSchema,
} from "@/features/booking/schemas/public-booking-schema";
import { createPublicBooking } from "@/features/booking/services/public-booking-service";
import type { PublicBookingResult } from "@/features/booking/types/booking-payment";

export type CreatePublicBookingResult = ActionResult<PublicBookingResult>;

export async function createPublicBookingAction(
  formData: FormData,
): Promise<CreatePublicBookingResult> {
  // A returning guest omits name, phone and license; the RPC only accepts
  // that when the email or phone matches an existing customer.
  const schema =
    formData.get("returning") === "1"
      ? returningBookingSchema
      : publicBookingSchema;
  const parsed = schema.safeParse({
    vehicleId: formData.get("vehicleId"),
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
