"use server";

import { z } from "zod";

import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  financeWriteMessage,
  requireOwner,
  saveFinanceRecord,
} from "@/features/finance/actions/save-finance-record";
import { PAYMENT_METHODS } from "@/features/finance/schemas/expense-definition";
import { vehicleLoanDefinition } from "@/features/finance/schemas/vehicle-loan-definition";

export async function saveVehicleLoanAction(formData: FormData) {
  return saveFinanceRecord({ definition: vehicleLoanDefinition, table: "vehicle_loans", formData, noun: "loan" });
}

const loanPaymentSchema = z
  .object({
    loanId: z.uuid(),
    installmentNumber: z.coerce.number().int().min(1),
    paidOn: z.iso.date("Enter the payment date."),
    principal: z.coerce.number({ error: "Enter the principal." }).min(0, "Cannot be negative."),
    interest: z.coerce.number({ error: "Enter the interest." }).min(0, "Cannot be negative."),
    paymentMethod: z.enum(PAYMENT_METHODS.map((method) => method.value) as [string, ...string[]]).optional(),
    reference: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.principal + value.interest > 0, {
    message: "Enter the amount paid.",
    path: ["principal"],
  });

export type RecordLoanPaymentInput = z.input<typeof loanPaymentSchema>;

/** Postgres messages from the loan RPCs are already written for the owner. */
function loanRpcMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "22023" || code === "23505" || code === "P0002") {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return financeWriteMessage(error, fallback);
}

/**
 * Records one installment. The RPC posts the interest as a vehicle-tagged
 * Interest expense in the same transaction.
 */
export async function recordLoanPaymentAction(
  input: RecordLoanPaymentInput,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to record loan payments." };

  const parsed = loanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted payment fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await requireOwner();
    const value = parsed.data;
    const { error } = await supabase.rpc("record_vehicle_loan_payment", {
      p_loan_id: value.loanId,
      p_installment_number: value.installmentNumber,
      p_paid_on: value.paidOn,
      p_principal: value.principal,
      p_interest: value.interest,
      p_payment_method: value.paymentMethod ?? null,
      p_reference: value.reference || null,
      p_notes: value.notes || null,
    });
    if (error) throw error;
    revalidateResource("/vehicles");
    revalidateResource("/finance");
    return { success: true };
  } catch (error) {
    return { success: false, message: loanRpcMessage(error, "The payment could not be recorded.") };
  }
}

/** Undoes a mistaken entry; its interest expense is voided with it. */
export async function voidLoanPaymentAction(paymentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(paymentId).success) return { success: false, message: "The payment ID is missing." };
  try {
    const supabase = await requireOwner();
    const { error } = await supabase.rpc("void_vehicle_loan_payment", { p_payment_id: paymentId });
    if (error) throw error;
    revalidateResource("/vehicles");
    revalidateResource("/finance");
    return { success: true };
  } catch (error) {
    return { success: false, message: loanRpcMessage(error, "The payment could not be voided.") };
  }
}
