"use server";

import { z } from "zod";

import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

const schema = z.object({
  rentalId: z.uuid("Select a rental."),
  paymentType: z.enum(["deposit", "balance", "penalty", "refund", "adjustment"]),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  method: z.enum(["gcash", "maya", "bank", "cash", "other"]).default("cash"),
  externalReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type RecordRentalPaymentInput = z.infer<typeof schema>;

export async function recordRentalPaymentAction(
  input: RecordRentalPaymentInput,
): Promise<ActionResult<{ paymentId: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to record payments." };
  }

  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<
      string,
      string[]
    >;
    const firstError = Object.values(fieldErrors).flat()[0];
    return {
      success: false,
      message: firstError ?? "Review the payment fields.",
      fieldErrors,
    };
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
      throw new Error("Your role cannot record payments.");
    }

    const { data, error } = await supabase.rpc("record_rental_payment", {
      p_rental_id: parsed.data.rentalId,
      p_payment_type: parsed.data.paymentType,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_external_reference: parsed.data.externalReference || null,
      p_notes: parsed.data.notes || null,
      p_confirm: true,
    });
    if (error) throw error;

    const payload = data as {
      success?: boolean;
      payment_id?: string;
      message?: string;
    };
    if (!payload?.success || !payload.payment_id) {
      throw new Error(payload?.message || "Could not record payment.");
    }

    revalidateResource("/rentals");
    return { success: true, data: { paymentId: payload.payment_id } };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Could not record the payment.",
    };
  }
}
