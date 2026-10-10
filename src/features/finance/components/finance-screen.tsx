import { Suspense } from "react";
import Link from "next/link";
import { CircleAlert, Info, Plus } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/features/analytics/components/kpi-tile";
import { PanelError } from "@/features/analytics/components/panel-error";
import { FinanceFrame } from "@/features/finance/components/finance-frame";
import { FinanceStatementSkeleton } from "@/features/finance/components/finance-skeleton";
import { PrintButton } from "@/features/finance/components/print-button";
import {
  DepreciationBlock,
  ExceptionsBlock,
  ExpenseLinesBlock,
  IncomeStatementBlock,
  ReceiptsBlock,
  TaxWorksheetBlock,
  VehicleMarginBlock,
} from "@/features/finance/components/statement-blocks";
import {
  defaultFinancePeriod,
  financePeriodOptions,
  resolveFinanceWindow,
  type FinanceWindow,
} from "@/features/finance/lib/finance-period";
import type { TaxSettings } from "@/features/finance/lib/income-tax";
import { getFinanceStatement, getTaxSettings } from "@/features/finance/services/finance-service";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

type SearchParams = Record<string, string | string[] | undefined>;

/** The BIR-oriented report: every figure the accountant transcribes. */
export async function FinanceScreen({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, settings] = await Promise.all([searchParams, getTaxSettings()]);
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };
  const fiscalStart = settings.fiscalYearStartMonth;
  const window = resolveFinanceWindow({ period: read("period"), from: read("from"), to: read("to") }, fiscalStart);
  const registered = settings.registeredName || "Zeke Car Rental & Services";

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/finance/expenses/new">
                <Plus /> Record expense
              </Link>
            </Button>
            <PrintButton />
          </>
        }
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Accountant report" }]}
        description={`${registered}${settings.tin ? ` · TIN ${settings.tin}` : ""} · ${settings.vatRegistered ? "VAT-registered" : "Non-VAT"} · ${window.label}`}
        title="Accountant report"
      />
      <Alert className="print:hidden">
        <Info />
        <AlertTitle>For your accountant</AlertTitle>
        <AlertDescription>
          The same money as the Overview, laid out the way BIR returns ask for it: VAT, withholding, depreciation and
          income tax. A filing aid, not a filing — rates come from Tax settings and must be confirmed by your
          accountant. Every figure links to the rows behind it.
        </AlertDescription>
      </Alert>
      <FinanceFrame
        defaultPeriod={defaultFinancePeriod(fiscalStart)}
        from={window.from}
        options={financePeriodOptions(fiscalStart)}
        pathname="/finance/report"
        period={window.period}
        summary={`${window.label}: ${formatDateKey(window.from)} – ${formatDateKey(window.to)} (${window.days} days, Manila time).`}
        to={window.to}
      >
        <Suspense fallback={<FinanceStatementSkeleton />}>
          <StatementBody settings={settings} window={window} />
        </Suspense>
      </FinanceFrame>
    </div>
  );
}

async function StatementBody({ window, settings }: { window: FinanceWindow; settings: TaxSettings }) {
  const result = await getFinanceStatement(window, settings);
  if (!result.ok) return <PanelError message={result.message} title="Financial statement" />;
  const statement = result.data;
  const income = statement.incomeStatement;

  return (
    <>
      {statement.exceptions.highCount > 0 ? (
        <Alert className="print:hidden" variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {statement.exceptions.highCount} high-risk{" "}
            {statement.exceptions.highCount === 1 ? "exception" : "exceptions"}
          </AlertTitle>
          <AlertDescription>
            <span>
              Deductions that BIR would likely disallow, or a vehicle with no cost on record.{" "}
              <a className="font-medium underline underline-offset-4" href="#exceptions">
                Review exceptions
              </a>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Revenue"
          note="Receipts net of VAT, plus tax withheld at source"
          value={formatPhpExact(income.revenue)}
        />
        <KpiTile
          label="Deductions"
          note={`Expenses ${formatPhpExact(income.operatingExpenses)} · depreciation ${formatPhpExact(income.depreciation)}`}
          value={formatPhpExact(income.operatingExpenses + income.depreciation)}
        />
        <KpiTile
          label="Net income"
          note={income.atRisk > 0 ? `${formatPhpExact(income.atRisk)} of deductions at risk` : "No deductions at risk"}
          value={formatPhpExact(income.netIncome)}
        />
        <KpiTile
          label="Exceptions"
          note={`${statement.exceptions.highCount} high risk`}
          value={String(statement.exceptions.count)}
        />
      </div>
      <ReceiptsBlock statement={statement} window={window} />
      <IncomeStatementBlock statement={statement} window={window} />
      <ExpenseLinesBlock statement={statement} window={window} />
      <DepreciationBlock statement={statement} window={window} />
      <VehicleMarginBlock statement={statement} window={window} />
      <TaxWorksheetBlock settings={settings} statement={statement} window={window} />
      <ExceptionsBlock statement={statement} window={window} />
    </>
  );
}
