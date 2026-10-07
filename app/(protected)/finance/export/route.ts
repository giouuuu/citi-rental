import { NextRequest, NextResponse } from "next/server";

import { requireOwner } from "@/features/finance/actions/save-finance-record";
import { resolveFinanceWindow } from "@/features/finance/lib/finance-period";
import {
  FINANCE_EXPORT_TYPES,
  financeExportSheet,
  ledgerExportRows,
  statementExportRows,
  type FinanceExportType,
} from "@/features/finance/services/finance-export";
import { getFinanceStatement, getTaxSettings } from "@/features/finance/services/finance-service";
import { toXlsx, xlsxResponse } from "@/features/shared/lib/to-xlsx";
import { toCsv } from "@/features/reports/lib/to-csv";

const LEDGER_TYPES = new Set<FinanceExportType>(["receipts", "expenses", "withholding"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") as FinanceExportType | null;
  if (!type || !FINANCE_EXPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  }

  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: "Only the owner can export the books." }, { status: 403 });
  }

  const settings = await getTaxSettings();
  const window = resolveFinanceWindow(
    { period: params.get("period"), from: params.get("from"), to: params.get("to") },
    settings.fiscalYearStartMonth,
  );

  let rows: Record<string, unknown>[];
  try {
    if (LEDGER_TYPES.has(type)) {
      rows = await ledgerExportRows(type, window);
    } else {
      const result = await getFinanceStatement(window, settings);
      if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
      rows = statementExportRows(type, result.data) ?? [];
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (params.get("format") === "xlsx") {
    const workbook = await toXlsx([financeExportSheet(type, rows)]);
    return xlsxResponse(workbook, `finance-${type}-${window.from}-to-${window.to}`);
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="finance-${type}-${window.from}-to-${window.to}.csv"`,
    },
  });
}
