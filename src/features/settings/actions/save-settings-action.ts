"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { settingsSchema } from "@/features/settings/schemas/settings-schema";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function saveSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to save organization settings.",
    };
  }

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted settings.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active || !isAdminRole(profile.role)) {
      throw new Error("Only owners or admins can update organization settings.");
    }

    const { error } = await supabase.rpc("update_organization_settings", {
      p_name: parsed.data.name,
      p_timezone: parsed.data.timezone,
      p_online_threshold: parsed.data.tracker_online_threshold_minutes,
      p_delayed_threshold: parsed.data.tracker_delayed_threshold_minutes,
      p_retention_days: parsed.data.location_retention_days,
      p_gps_provider: parsed.data.gps_provider,
    });
    if (error) throw error;

    const { error: paymentError } = await supabase
      .from("organizations")
      .update({
        deposit_percent: parsed.data.deposit_percent,
        payment_qr_url: parsed.data.payment_qr_url || null,
        payment_instructions: parsed.data.payment_instructions?.trim() || null,
      })
      .eq("id", profile.organization_id);
    if (paymentError) throw paymentError;

    revalidateResource("/settings");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Settings could not be saved.",
    };
  }
}
