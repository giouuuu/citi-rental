import "server-only";

import { createClient } from "@/lib/supabase/server";
import { manilaDayEnd, manilaDayStart } from "@/features/shared/lib/manila-time";
import { EXCEPTION_COPY, type FinanceStatement } from "@/features/finance/lib/statement";

export const FINANCE_EXPORT_TYPES = [
  "statement",
  "receipts",
  "expenses",
  "depreciation",
  "vehicles",
  "monthly",
  "exceptions",
  "withholding",
] as const;

export type FinanceExportType = (typeof FINANCE_EXPORT_TYPES)[number];

type Row = Record<string, unknown>;

/** Schedules derived from the assembled statement (same numbers as the screen). */
export function statementExportRows(type: FinanceExportType, statement: FinanceStatement): Row[] | null {
  switch (type) {
    case "statement": {
      const r = statement.receipts;
      const i = statement.incomeStatement;
      return [
        { section: "Receipts", line: "Collected", amount: r.grossCollected },
        { section: "Receipts", line: "Refunds", amount: -r.refunds },
        { section: "Receipts", line: "Net receipts collected", amount: r.netReceipts },
        { section: "Receipts", line: "VATable", amount: r.vatable },
        { section: "Receipts", line: "Zero-rated", amount: r.zeroRated },
        { section: "Receipts", line: "VAT-exempt", amount: r.exempt },
        { section: "Receipts", line: "Non-VAT", amount: r.nonVat },
        { section: "Receipts", line: "Output VAT", amount: -r.outputVat },
        { section: "Receipts", line: "Receipts net of VAT", amount: r.netOfVat },
        { section: "Receipts", line: "Tax withheld at source (2307)", amount: r.cwtWithheld },
        { section: "Receipts", line: "Gross receipts for income tax", amount: r.incomeTaxBase },
        ...statement.expenses.lines
          .filter((line) => line.entries > 0)
          .map((line) => ({ section: "Deductions", line: line.birLine, amount: -line.net })),
        { section: "Deductions", line: "Depreciation", amount: -i.depreciation },
        { section: "Result", line: "Net income", amount: i.netIncome },
        { section: "Result", line: "Deductions at risk of disallowance", amount: i.atRisk },
        { section: "Result", line: "Net income if at-risk deductions are disallowed", amount: i.netIncomeIfDisallowed },
        ...statement.tax.elections.map((row) => ({
          section: "Income tax by election",
          line: `${row.label}${row.elected ? " (elected)" : ""}${row.eligible ? "" : " (not available)"}`,
          amount: row.totalTax,
        })),
      ];
    }
    case "depreciation":
      return statement.depreciation.rows.map((row) => ({
        asset: row.asset.name,
        vehicle: row.asset.vehiclePlate ?? "",
        acquisition_date: row.asset.acquisitionDate,
        acquisition_cost: row.asset.acquisitionCost,
        salvage_value: row.asset.salvageValue,
        useful_life_months: row.asset.usefulLifeMonths,
        method: row.asset.method,
        disposed_on: row.asset.disposedOn ?? "",
        depreciation_this_period: row.inPeriod,
        accumulated_to_period_end: row.accumulated,
        book_value_at_period_end: row.bookValue,
      }));
    case "vehicles":
      return statement.vehicles.map((row) => ({
        plate_number: row.plateNumber,
        name: row.name,
        receipts_net_of_vat: row.receipts,
        tagged_costs_net: row.expenses,
        depreciation: row.depreciation,
        margin: row.margin,
        has_acquisition_cost: row.hasAsset,
      }));
    case "monthly":
      return statement.monthly.map((row) => ({
        month: row.month,
        net_receipts: row.netReceipts,
        output_vat: row.outputVat,
        expenses_net: row.expensesNet,
        creditable_input_vat: row.creditableInputVat,
        ewt_withheld: row.ewt,
      }));
    case "exceptions":
      return statement.exceptions.groups.flatMap((group) =>
        group.rows.map((row) => ({
          severity: row.severity,
          issue: EXCEPTION_COPY[row.kind].title,
          record_type: row.recordType,
          record_id: row.recordId,
          record: row.label,
          date: row.occurredOn ?? "",
          amount: row.amount ?? "",
        })),
      );
    default:
      return null;
  }
}

/** Source-row schedules read straight from the ledgers. */
export async function ledgerExportRows(
  type: FinanceExportType,
  window: { from: string; to: string },
): Promise<Row[]> {
  const supabase = await createClient();

  if (type === "receipts") {
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, payment_type, amount, vat_treatment, vat_rate, vat_amount, net_of_vat, method, external_reference, confirmed_at, rentals(reference_number, booking_source, vehicles(plate_number))",
      )
      .eq("status", "confirmed")
      .gte("confirmed_at", manilaDayStart(window.from).toISOString())
      .lt("confirmed_at", manilaDayEnd(window.to).toISOString())
      .order("confirmed_at", { ascending: true })
      .limit(10000);
    if (error) throw error;
    return ((data ?? []) as Row[]).map((row) => {
      const rental = (row.rentals ?? {}) as { reference_number?: string; booking_source?: string; vehicles?: { plate_number?: string } };
      return {
        confirmed_at: row.confirmed_at,
        rental_reference: rental.reference_number ?? "",
        vehicle: rental.vehicles?.plate_number ?? "",
        channel: rental.booking_source ?? "",
        payment_type: row.payment_type,
        method: row.method,
        amount: row.amount,
        vat_treatment: row.vat_treatment,
        vat_rate: row.vat_rate ?? "",
        vat_amount: row.vat_amount,
        net_of_vat: row.net_of_vat,
        counted_in_receipts: row.payment_type === "penalty" ? "no (charge billed, not cash)" : row.payment_type === "refund" ? "deducted" : "yes",
        external_reference: row.external_reference ?? "",
        payment_id: row.id,
      };
    });
  }

  if (type === "expenses") {
    const { data, error } = await supabase
      .from("expense_ledger")
      .select(
        "id, expense_date, bir_line, category_name, description, vehicle_plate, supplier_name, supplier_tin, supplier_vat_registered, document_type, document_number, gross_amount, input_vat, net_amount, withholding_required, ewt_percent, ewt_amount, ewt_remitted, payment_method, status",
      )
      .gte("expense_date", window.from)
      .lte("expense_date", window.to)
      .order("expense_date", { ascending: true })
      .limit(10000);
    if (error) throw error;
    return (data ?? []) as Row[];
  }

  if (type === "withholding") {
    const { data, error } = await supabase
      .from("withholding_certificates")
      .select(
        "id, payor_name, payor_tin, atc_code, period_from, period_to, income_payment, tax_withheld, status, received_on, certificate_reference",
      )
      .gte("period_to", window.from)
      .lte("period_to", window.to)
      .order("period_to", { ascending: true })
      .limit(10000);
    if (error) throw error;
    return (data ?? []) as Row[];
  }

  return [];
}
