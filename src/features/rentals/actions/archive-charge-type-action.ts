"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function archiveChargeTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The charge type ID is missing." };

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
    if (!profile?.is_active) throw new Error("Your profile is not active.");
    if (!isAdminRole(profile.role))
      throw new Error("Only owners and admins can manage charge types.");

    // Archived types stay on past bills; they just leave the Add charge list.
    const { data, error } = await supabase
      .from("rental_charge_types")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The charge type was not found.");

    revalidateResource("/settings/charge-types");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The charge type could not be archived.",
    };
  }
}
