"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { financeWriteMessage, requireOwner } from "@/features/finance/actions/save-finance-record";
import { taxSettingsSchema, taxSettingsToRow } from "@/features/finance/schemas/tax-settings-schema";

export async function saveTaxSettingsAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to save tax settings." };
  }

  const parsed = taxSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted tax settings.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await requireOwner();
    const { data: claims } = await supabase.auth.getClaims();
    const { data: current, error: readError } = await supabase
      .from("tax_settings")
      .select("id")
      .single();
    if (readError) throw readError;

    const { error } = await supabase
      .from("tax_settings")
      .update({ ...taxSettingsToRow(parsed.data), updated_by: claims?.claims?.sub ?? null })
      .eq("id", current.id);
    if (error) throw error;

    revalidateResource("/finance");
    return { success: true };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, "Tax settings could not be saved.") };
  }
}

/**
 * Re-applies the CURRENT VAT settings to payments from a date on. Needed once
 * after registering for VAT: rows are stamped when written, so history does
 * not change on its own.
 */
export async function restampPaymentVatAction(
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const from = String(formData.get("from") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { success: false, message: "Pick the date VAT registration took effect.", fieldErrors: { from: ["Pick a date."] } };
  }

  try {
    const supabase = await requireOwner();
    const { data, error } = await supabase.rpc("finance_restamp_payment_vat", { p_from: from });
    if (error) throw error;
    revalidateResource("/finance");
    return { success: true, data: { count: Number(data ?? 0) } };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, "Payments could not be re-stamped.") };
  }
}
