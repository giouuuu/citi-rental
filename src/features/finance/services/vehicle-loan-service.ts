import "server-only";

import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { describeError } from "@/features/analytics/lib/analytics-error";
import type { FixedAsset } from "@/features/finance/lib/depreciation";
import type {
  LoanInterestMethod,
  LoanPayment,
  LoanStatus,
  VehicleLoan,
} from "@/features/finance/lib/loan-schedule";
import { financeErrorMessage, fixedAssetFromRow, type FinanceResult } from "@/features/finance/services/finance-service";
import { toMoney } from "@/features/shared/lib/money";

export type VehicleBooks = {
  loans: VehicleLoan[];
  payments: LoanPayment[];
  asset: FixedAsset | null;
};

function loanFromRow(row: Record<string, unknown>): VehicleLoan {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    lenderName: String(row.lender_name ?? ""),
    accountNumber: row.account_number ? String(row.account_number) : null,
    amountFinanced: toMoney(row.amount_financed),
    monthlyAmortization: toMoney(row.monthly_amortization),
    termMonths: Number(row.term_months),
    firstDueDate: String(row.first_due_date),
    installmentsPaidBefore: Number(row.installments_paid_before ?? 0),
    interestMethod: row.interest_method as LoanInterestMethod,
    status: row.status as LoanStatus,
    notes: row.notes ? String(row.notes) : null,
  };
}

function paymentFromRow(row: Record<string, unknown>): LoanPayment {
  return {
    id: String(row.id),
    loanId: String(row.loan_id),
    installmentNumber: Number(row.installment_number),
    paidOn: String(row.paid_on),
    principal: toMoney(row.principal_amount),
    interest: toMoney(row.interest_amount),
    amountPaid: toMoney(row.amount_paid),
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    status: row.status === "void" ? "void" : "recorded",
  };
}

/**
 * One car's loans, their payments, and its fixed-asset register row. Owner
 * only (RLS); callers check the role before asking.
 */
export async function getVehicleBooks(vehicleId: string): Promise<FinanceResult<VehicleBooks>> {
  try {
    const supabase = await createClient();
    const [loans, assets] = await Promise.all([
      supabase
        .from("vehicle_loans")
        .select(
          "id, vehicle_id, lender_name, account_number, amount_financed, monthly_amortization, term_months, first_due_date, installments_paid_before, interest_method, status, notes",
        )
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false }),
      supabase
        .from("fixed_asset_register")
        .select(
          "id, name, vehicle_id, vehicle_plate, acquisition_date, acquisition_cost, salvage_value, useful_life_months, depreciation_method, disposed_on",
        )
        .eq("vehicle_id", vehicleId)
        .maybeSingle(),
    ]);
    if (loans.error) throw loans.error;
    if (assets.error) throw assets.error;

    const loanRows = ((loans.data ?? []) as Record<string, unknown>[]).map(loanFromRow);
    let payments: LoanPayment[] = [];
    if (loanRows.length > 0) {
      const { data, error } = await supabase
        .from("vehicle_loan_payments")
        .select(
          "id, loan_id, installment_number, paid_on, principal_amount, interest_amount, amount_paid, payment_method, reference_number, status",
        )
        .in(
          "loan_id",
          loanRows.map((loan) => loan.id),
        )
        .order("installment_number", { ascending: true });
      if (error) throw error;
      payments = ((data ?? []) as Record<string, unknown>[]).map(paymentFromRow);
    }

    return {
      ok: true,
      data: {
        loans: loanRows,
        payments,
        asset: assets.data ? fixedAssetFromRow(assets.data as Record<string, unknown>) : null,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`Vehicle books failed: ${describeError(error)}`);
    return { ok: false, message: financeErrorMessage(error) };
  }
}
