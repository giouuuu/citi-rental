"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/vehicle-costs/lib/upload-expense-receipt";

/**
 * Hard delete — expenses have no status lifecycle to archive into. Staff can
 * record expenses, but removing a money record is owner/admin only.
 */
export async function deleteVehicleExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The expense ID is missing." };
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to delete expenses." };

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
    if (!isAdminRole(profile.role))
      throw new Error("Only owners and admins can delete expenses.");

    const { data, error } = await supabase
      .from("vehicle_expenses")
      .delete()
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .select("id, receipt_path")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new Error("The expense was not found in your organization.");

    // Best-effort: the row is gone either way; a failure only orphans a file.
    if (data.receipt_path) {
      await supabase.storage
        .from(EXPENSE_RECEIPTS_BUCKET)
        .remove([data.receipt_path]);
    }

    revalidateResource("/expenses");
    revalidateResource("/vehicles");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The expense could not be deleted.",
    };
  }
}
