"use server";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/features/shared/types/resource";
import { siteUrl } from "@/features/booking/lib/notify-owner-telegram";
import {
  createCheckoutSession,
  isPaymongoEnabled,
} from "@/features/booking/lib/paymongo";
import { getBookingPaymentDetails } from "@/features/booking/services/public-booking-service";

const schema = z.object({
  rentalId: z.uuid("Invalid booking."),
  referenceNumber: z.string().trim().min(3).max(60),
});

export type StartPaymongoCheckoutResult = ActionResult<{ checkoutUrl: string }>;

/**
 * Creates a PayMongo Checkout Session for a draft booking's reservation fee and
 * returns the hosted page URL. The amount always comes from the booking row,
 * never from the browser.
 */
export async function startPaymongoCheckoutAction(
  formData: FormData,
): Promise<StartPaymongoCheckoutResult> {
  const parsed = schema.safeParse({
    rentalId: formData.get("rentalId"),
    referenceNumber: formData.get("referenceNumber"),
  });
  if (!parsed.success) {
    return { success: false, message: "Booking not found." };
  }

  const admin = createAdminClient();
  if (!isPaymongoEnabled() || !admin) {
    return {
      success: false,
      message: "Online payment is not available yet. Upload your payment proof instead.",
    };
  }

  const { rentalId, referenceNumber } = parsed.data;
  const booking = await getBookingPaymentDetails(rentalId, referenceNumber);
  if (!booking) {
    return { success: false, message: "Booking not found. Check your reference number." };
  }
  if (booking.status !== "draft" || booking.paymentStatus !== "unpaid") {
    return {
      success: false,
      message: "This booking already has a payment. Refresh the page to see its status.",
    };
  }

  try {
    const payUrl = `${siteUrl()}/book/pay/${rentalId}?ref=${encodeURIComponent(referenceNumber)}`;
    const session = await createCheckoutSession({
      amount: booking.depositAmount,
      referenceNumber,
      rentalId,
      itemName: `Reservation fee — ${booking.vehicleName}`,
      description: `Reservation ${referenceNumber}`,
      successUrl: `${payUrl}&paymongo=success`,
      cancelUrl: `${payUrl}&paymongo=cancelled`,
    });

    const { error } = await admin.rpc("record_paymongo_checkout", {
      p_rental_id: rentalId,
      p_reference_number: referenceNumber,
      p_checkout_session_id: session.id,
      p_amount: booking.depositAmount,
      p_livemode: session.livemode,
    });
    if (error) throw new Error(error.message);

    return { success: true, data: { checkoutUrl: session.checkoutUrl } };
  } catch (error) {
    console.error("[paymongo] start checkout failed", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "We could not start online payment. Please try again.",
    };
  }
}
