"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/features/shared/types/resource";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { submitBookingPaymentProof } from "@/features/booking/services/public-booking-service";
import type { RentalPaymentStatus } from "@/features/booking/types/booking-payment";

const schema = z.object({
  rentalId: z.uuid("Invalid booking."),
  referenceNumber: z.string().trim().min(3).max(60),
  paymentReference: z
    .string()
    .trim()
    .min(3, "Enter the payment reference from GCash/Maya/bank.")
    .max(120),
});

export type SubmitPaymentProofResult = ActionResult<{
  rentalId: string;
  referenceNumber: string;
  paymentStatus: RentalPaymentStatus;
  message: string;
}>;

export async function submitPaymentProofAction(
  formData: FormData,
): Promise<SubmitPaymentProofResult> {
  // Only the booking's signed-in owner may pay; submit_booking_payment_proof
  // and the payment-proofs bucket refuse guests too.
  if (!(await isBookingUserSignedIn())) {
    return {
      success: false,
      message: "Sign in to send your payment proof. Your session may have expired.",
    };
  }

  const parsed = schema.safeParse({
    rentalId: formData.get("rentalId"),
    referenceNumber: formData.get("referenceNumber"),
    paymentReference: formData.get("paymentReference"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const proof = formData.get("proof");
  if (!(proof instanceof File) || proof.size <= 0) {
    return {
      success: false,
      message: "Upload a screenshot of your payment.",
      fieldErrors: { proof: ["Upload a screenshot of your payment."] },
    };
  }

  try {
    const result = await submitBookingPaymentProof({
      ...parsed.data,
      proof,
    });
    // The landing's booking reminder card reads this booking.
    revalidatePath("/");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "We could not save your payment proof. Please try again.",
    };
  }
}
