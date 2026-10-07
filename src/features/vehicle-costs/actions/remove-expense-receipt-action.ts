"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/vehicle-costs/lib/upload-expense-receipt";

/** Detach the receipt photo from an expense; the expense itself stays. */
export async function removeExpenseReceiptAction(
  expenseId: string,
): Promise<ActionResult> {
  if (!expenseId) return { success: false, message: "The expense ID is missing." };
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to remove receipts." };

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
      throw new Error("Only owners and admins can remove receipts.");

    const { data: current, error: readError } = await supabase
      .from("vehicle_expenses")
      .select("receipt_path")
      .eq("id", expenseId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("The expense was not found.");
    if (!current.receipt_path) throw new Error("This expense has no receipt.");

    const { error } = await supabase
      .from("vehicle_expenses")
      .update({ receipt_path: null })
      .eq("id", expenseId);
    if (error) throw error;

    // Best-effort: the row no longer points at it, so a failure only orphans a file.
    await supabase.storage
      .from(EXPENSE_RECEIPTS_BUCKET)
      .remove([current.receipt_path]);

    revalidateResource("/expenses");
    revalidateResource("/vehicles");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "The receipt could not be removed.",
    };
  }
}
