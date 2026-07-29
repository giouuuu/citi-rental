"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";

export async function archiveVehicleAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The vehicle ID is missing." };

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile || !profile.is_active)
      throw new Error("Your profile is not active for this organization.");
    if (!isAdminRole(profile.role))
      throw new Error("Your role cannot modify vehicles.");

    const { data, error } = await supabase
      .from("vehicles")
      .update({ status: "inactive" })
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The vehicle was not found in your organization.");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The vehicle could not be archived.";
    if (message.includes("foreign key"))
      return {
        success: false,
        message: "This vehicle is still linked to another active record.",
      };
    return { success: false, message };
  }
}
