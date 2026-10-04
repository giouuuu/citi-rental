"use server";

import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  financeWriteMessage,
  requireOwner,
  saveFinanceRecord,
} from "@/features/finance/actions/save-finance-record";
import { expenseDefinition } from "@/features/finance/schemas/expense-definition";
import { fixedAssetDefinition } from "@/features/finance/schemas/fixed-asset-definition";
import { withholdingCertificateDefinition } from "@/features/finance/schemas/withholding-certificate-definition";

export async function saveExpenseAction(formData: FormData) {
  return saveFinanceRecord({ definition: expenseDefinition, table: "expenses", formData, noun: "expense" });
}

/** Expenses are voided, never deleted, so the ledger keeps its history. */
export async function voidExpenseAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The expense ID is missing." };
  try {
    const supabase = await requireOwner();
    const { data, error } = await supabase
      .from("expenses")
      .update({ status: "void" })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The expense was not found.");
    revalidateResource(expenseDefinition.route);
    revalidateResource("/finance");
    revalidateResource("/vehicles");
    return { success: true };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, "The expense could not be voided.") };
  }
}

export async function saveFixedAssetAction(formData: FormData) {
  return saveFinanceRecord({
    definition: fixedAssetDefinition,
    table: "fixed_assets",
    formData,
    noun: "fixed asset",
  });
}

export async function saveWithholdingCertificateAction(formData: FormData) {
  return saveFinanceRecord({
    definition: withholdingCertificateDefinition,
    table: "withholding_certificates",
    formData,
    noun: "certificate",
  });
}
