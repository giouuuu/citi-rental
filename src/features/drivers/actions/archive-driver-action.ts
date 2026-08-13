"use server";

import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function archiveDriverAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The driver ID is missing." };

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active)
      throw new Error("Your profile is not active for this organization.");
    if (!isStaffRole(profile.role))
      throw new Error("Your role cannot modify drivers.");

    const { data, error } = await supabase
      .from("drivers")
      .update({ status: "inactive" })
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The driver was not found in your organization.");

    revalidateResource("/drivers");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The driver could not be archived.",
    };
  }
}
