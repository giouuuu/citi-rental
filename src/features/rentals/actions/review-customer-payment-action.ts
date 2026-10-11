"use server";

import { z } from "zod";

import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

const schema = z.object({
  paymentId: z.uuid("Select a payment."),
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export type ReviewCustomerPaymentInput = z.infer<typeof schema>;

/** Staff confirm or reject a bill payment the customer sent from the pay page. */
export async function reviewCustomerPaymentAction(
  input: ReviewCustomerPaymentInput,
): Promise<ActionResult<{ paymentId: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to review payments." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Select a valid payment." };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active || !isStaffRole(profile.role)) {
      throw new Error("Your role cannot review payments.");
    }

    const { data, error } = await supabase.rpc("review_customer_payment", {
      p_payment_id: parsed.data.paymentId,
      p_approve: parsed.data.approve,
      p_reason: parsed.data.reason || null,
    });
    if (error) throw error;

    const payload = data as { success?: boolean; message?: string };
    if (!payload?.success) {
      throw new Error(payload?.message || "Could not review the payment.");
    }

    revalidateResource("/rentals");
    return { success: true, data: { paymentId: parsed.data.paymentId } };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Could not review the payment.",
    };
  }
}
