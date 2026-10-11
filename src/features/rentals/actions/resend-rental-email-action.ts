"use server";

import { z } from "zod";

import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  notificationId: z.uuid("Select an email to resend."),
  recipient: z
    .string()
    .trim()
    .max(254, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  updateCustomer: z
    .enum(["on", "true", "false"])
    .optional()
    .transform((value) => value === "on" || value === "true"),
});

/**
 * Sends a customer email again, to a corrected address when it was typed
 * wrong. The address can also be saved on the customer for later emails.
 */
export async function resendRentalEmailAction(
  formData: FormData,
): Promise<ActionResult<{ recipient: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to send emails." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const recipient = parsed.error.issues.find(
      (issue) => issue.path[0] === "recipient",
    );
    return {
      success: false,
      message: recipient?.message ?? "Select an email to resend.",
      fieldErrors: recipient ? { recipient: [recipient.message] } : undefined,
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
    if (!profile?.is_active || !isAdminRole(profile.role)) {
      throw new Error("Only the owner or an admin can resend emails.");
    }

    const { data, error } = await supabase.rpc("resend_rental_notification", {
      p_notification_id: parsed.data.notificationId,
      p_recipient: parsed.data.recipient,
      p_update_customer: parsed.data.updateCustomer,
    });
    if (error) throw error;

    const payload = data as {
      success?: boolean;
      message?: string;
      recipient?: string;
    };
    if (!payload?.success) {
      throw new Error(payload?.message || "Could not resend the email.");
    }

    revalidateResource("/rentals");
    if (parsed.data.updateCustomer) revalidateResource("/customers");
    return {
      success: true,
      data: { recipient: payload.recipient ?? parsed.data.recipient },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Could not resend the email.",
    };
  }
}
