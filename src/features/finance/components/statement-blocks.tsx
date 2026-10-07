import Link from "next/link";
import { CircleAlert, CircleCheck, Download, Plus } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEPRECIATION_METHOD_LABELS } from "@/features/finance/schemas/fixed-asset-definition";
import type { FinanceWindow } from "@/features/finance/lib/finance-period";
import { pct, type TaxSettings } from "@/features/finance/lib/income-tax";
import type { ExceptionRow, FinanceStatement } from "@/features/finance/lib/statement";
import { MoneyCell, StatementLines } from "@/features/finance/components/statement-lines";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";

type BlockProps = { statement: FinanceStatement; window: FinanceWindow };

function windowQuery(window: FinanceWindow) {
  return `from=${window.from}&to=${window.to}`;
}

export function exportHref(type: string, window: FinanceWindow) {
  return `/finance/export?type=${type}&${windowQuery(window)}`;
}

function BlockHeader({
  title,
  description,
  exportType,
  window,
}: {
  title: string;
  description: string;
  exportType?: string;
  window: FinanceWindow;
}) {
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
      <div className="space-y-1.5">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {exportType ? (
        <Button asChild className="shrink-0 print:hidden" size="sm" variant="ghost">
          <a download href={exportHref(exportType, window)}>
            <Download /> CSV
          </a>
        </Button>
      ) : null}
    </CardHeader>
  );
}

// ---------------------------------------------------------------------------
// Block A — gross receipts
// ---------------------------------------------------------------------------
export function ReceiptsBlock({ statement, window }: BlockProps) {
  const r = statement.receipts;
  return (
    <Card>
      <BlockHeader
        description="Cash basis, dated by when each payment was confirmed — the base for VAT and percentage tax."
        exportType="receipts"
        title="A. Gross receipts"
        window={window}
      />
      <CardContent className="pt-2">
        <StatementLines
          label="Gross receipts"
          lines={[
            { label: "Collected (deposits, balances, adjustments)", amount: r.grossCollected },
            { label: "Less: refunds", amount: r.refunds, negative: true },
            { label: "Net receipts collected", amount: r.netReceipts, kind: "subtotal" },
            { label: "VATable", amount: r.vatable, indent: true },
            { label: "Zero-rated", amount: r.zeroRated, indent: true },
            { label: "VAT-exempt", amount: r.exempt, indent: true },
            { label: "Non-VAT (not VAT-registered when received)", amount: r.nonVat, indent: true },
            { label: "Less: output VAT", amount: r.outputVat, negative: true },
            { label: "Receipts net of VAT", amount: r.netOfVat, kind: "subtotal" },
            {
              label: "Add: tax withheld at source by clients",
              amount: r.cwtWithheld,
              href: `/finance/withholding?${windowQuery(window)}`,
              note: "Per 2307s for this period. Assumes payments were recorded net of the withheld tax.",
            },
            { label: "Gross receipts for income tax", amount: r.incomeTaxBase, kind: "total" },
          ]}
        />
        <div className="mt-6 grid gap-4 border-t pt-4 text-sm md:grid-cols-2">
          <StatementLines
            label="Receipts by channel"
            lines={[
              { label: "Website bookings", amount: r.publicWeb },
              { label: "Front desk", amount: r.ops },
            ]}
          />
          <StatementLines
            label="Accrual memo"
            lines={[
              {
                label: "Charges billed",
                amount: r.penaltiesBilled,
                note: "Accrued, not cash. Settled through balance payments, so already in receipts once paid. VAT treatment is the accountant's call.",
              },
              {
                label: "Receivable",
                amount: r.outstandingBalance,
                note: "Still owed on rentals whose car has gone out, as of today.",
              },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Income statement + Block B (expenses by BIR line)
// ---------------------------------------------------------------------------
export function IncomeStatementBlock({ statement, window }: BlockProps) {
  const i = statement.incomeStatement;
  const used = statement.expenses.lines.filter((line) => line.entries > 0);
  return (
    <Card>
      <BlockHeader
        description="Receipts less costs, both net of VAT. Expenses carry their BIR itemized-deduction line."
        exportType="statement"
        title="Income statement"
        window={window}
      />
      <CardContent className="pt-2">
        <StatementLines
          label="Income statement"
          lines={[
            { label: "Revenue (gross receipts for income tax)", amount: i.revenue, kind: "subtotal" },
            ...used.map((line) => ({
              label: line.birLine === line.name ? line.name : `${line.name} — ${line.birLine}`,
              amount: line.net,
              indent: true,
              href: `/finance/expenses?category=${line.categoryId}&${windowQuery(window)}&status=recorded`,
            })),
            {
              label: "Depreciation",
              amount: i.depreciation,
              indent: true,
              href: "/finance/assets",
            },
            {
              label: "Total deductions",
              amount: i.operatingExpenses + i.depreciation,
              kind: "subtotal",
              negative: true,
            },
            { label: "Net income", amount: i.netIncome, kind: "total" },
            ...(i.atRisk > 0
              ? [
                  {
                    label: "Net income if at-risk deductions are disallowed",
                    amount: i.netIncomeIfDisallowed,
                    note: `${formatPhpExact(i.atRisk)} of deductions lack a valid document or remitted withholding. See exceptions.`,
                  },
                ]
              : []),
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function ExpenseLinesBlock({ statement, window }: BlockProps) {
  const e = statement.expenses;
  return (
    <Card>
      <BlockHeader
        description="Every active line from the Schedule of Itemized Deductions, so the accountant transcribes rather than reclassifies."
        exportType="expenses"
        title="B. Expenses by BIR deduction line"
        window={window}
      />
      <CardContent className="pt-2">
        <Table aria-label="Expenses by BIR deduction line">
          <TableHeader>
            <TableRow>
              <TableHead>BIR line</TableHead>
              <TableHead className="text-right">Entries</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Input VAT</TableHead>
              <TableHead className="text-right">Net of VAT</TableHead>
              <TableHead className="text-right">EWT</TableHead>
              <TableHead className="text-right">At risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {e.lines.map((line) => (
              <TableRow className={cn(line.entries === 0 && "text-muted-foreground")} key={line.categoryId}>
                <TableCell className="whitespace-normal">
                  {line.entries > 0 ? (
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/finance/expenses?category=${line.categoryId}&${windowQuery(window)}&status=recorded`}
                    >
                      {line.name}
                    </Link>
                  ) : (
                    line.name
                  )}
                  {line.birLine !== line.name ? (
                    <span className="block text-xs text-muted-foreground">{line.birLine}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{line.entries}</TableCell>
                <MoneyCell value={line.gross} />
                <MoneyCell value={line.inputVat} />
                <MoneyCell value={line.net} />
                <MoneyCell value={line.ewt} />
                <MoneyCell className={cn(line.atRisk > 0 && "text-destructive")} value={line.atRisk} />
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell />
              <MoneyCell value={e.lines.reduce((total, line) => total + line.gross, 0)} />
              <MoneyCell value={e.inputVat} />
              <MoneyCell value={e.net} />
              <MoneyCell value={e.ewt} />
              <MoneyCell value={e.atRisk} />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Block C — depreciation schedule
// ---------------------------------------------------------------------------
export function DepreciationBlock({ statement, window }: BlockProps) {
  const rows = statement.depreciation.rows;
  return (
    <Card>
      <BlockHeader
        description={`Computed from the fixed-asset register. Accumulated depreciation and book value are as of ${formatDateKey(window.to)}.`}
        exportType="depreciation"
        title="C. Depreciation schedule"
        window={window}
      />
      <CardContent className="pt-2">
        {rows.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No assets in the register yet</EmptyTitle>
              <EmptyDescription>
                Depreciation is usually a fleet&apos;s largest deduction. Record each unit&apos;s acquisition cost to claim it.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/finance/assets/new">
                  <Plus /> Add fixed asset
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table aria-label="Depreciation schedule">
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Acquired</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">This period</TableHead>
                <TableHead className="text-right">Accumulated</TableHead>
                <TableHead className="text-right">Book value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.asset.id}>
                  <TableCell className="whitespace-normal">
                    <Link className="underline-offset-4 hover:underline" href={`/finance/assets/${row.asset.id}`}>
                      {row.asset.name}
                    </Link>
                    {row.asset.vehiclePlate ? (
                      <span className="block text-xs text-muted-foreground">{row.asset.vehiclePlate}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDateKey(row.asset.acquisitionDate)}</TableCell>
                  <MoneyCell value={row.asset.acquisitionCost} />
                  <TableCell className="whitespace-normal text-sm">
                    {DEPRECIATION_METHOD_LABELS[row.asset.method]}
                    <span className="block text-xs text-muted-foreground">
                      {row.asset.usefulLifeMonths} months
                      {row.asset.disposedOn ? ` · disposed ${formatDateKey(row.asset.disposedOn)}` : ""}
                    </span>
                  </TableCell>
                  <MoneyCell value={row.inPeriod} />
                  <MoneyCell value={row.accumulated} />
                  <MoneyCell value={row.bookValue} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total depreciation this period</TableCell>
                <MoneyCell value={statement.depreciation.total} />
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          RR 12-2012 caps vehicle depreciation for most taxpayers but carves out lessors of transportation
          equipment, so fleet units are depreciated in full here. Confirm the current issuance with your accountant.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Per-vehicle margin
// ---------------------------------------------------------------------------
export function VehicleMarginBlock({ statement, window }: BlockProps) {
  return (
    <Card>
      <BlockHeader
        description="Receipts net of VAT, less costs tagged to the unit and its depreciation. Weakest first — the unit to sell is at the top."
        exportType="vehicles"
        title="Profit by vehicle"
        window={window}
      />
      <CardContent className="pt-2">
        <Table aria-label="Profit by vehicle">
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-right">Receipts</TableHead>
              <TableHead className="text-right">Tagged costs</TableHead>
              <TableHead className="text-right">Depreciation</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.vehicles.map((row) => (
              <TableRow key={row.vehicleId}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{row.plateNumber}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.name}
                    {row.hasAsset ? null : (
                      <>
                        {" · "}
                        <Link className="text-destructive underline-offset-4 hover:underline" href="/finance/assets/new">
                          no acquisition cost
                        </Link>
                      </>
                    )}
                  </span>
                </TableCell>
                <MoneyCell value={row.receipts} />
                <TableCell className="text-right font-mono tabular-nums">
                  {row.expenses ? (
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/finance/expenses?vehicle=${row.vehicleId}&${windowQuery(window)}&status=recorded`}
                    >
                      {formatPhpExact(row.expenses)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{formatPhpExact(0)}</span>
                  )}
                </TableCell>
                <MoneyCell value={row.depreciation} />
                <MoneyCell
                  className={cn("font-semibold", row.margin < 0 && "text-destructive")}
                  value={row.margin}
                />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Block D — tax position worksheet
// ---------------------------------------------------------------------------
export function TaxWorksheetBlock({
  statement,
  window,
  settings,
}: BlockProps & { settings: TaxSettings }) {
  const { business, elections, cwt, ewt, forms } = statement.tax;
  const annual = window.kind === "year" || window.kind === "ytd";
  return (
    <Card>
      <BlockHeader
        description="What each return asks for, side by side. Figures for the accountant to confirm — not a filing."
        title="D. Tax position worksheet"
        window={window}
      />
      <CardContent className="space-y-8 pt-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="business-tax" className="space-y-2">
            <h3 className="text-sm font-semibold" id="business-tax">
              {business.kind === "vat" ? "VAT — BIR Form 2550Q" : "Percentage tax — BIR Form 2551Q"}
            </h3>
            {business.kind === "vat" ? (
              <StatementLines
                label="VAT"
                lines={[
                  { label: "Output VAT on receipts", amount: business.outputVat },
                  {
                    label: "Less: creditable input VAT",
                    amount: business.creditableInputVat,
                    negative: true,
                    note: "VAT invoices from VAT-registered suppliers only.",
                  },
                  business.payable >= 0
                    ? { label: "VAT payable", amount: business.payable, kind: "total" }
                    : { label: "Excess input VAT carried over", amount: -business.payable, kind: "total" },
                ]}
              />
            ) : (
              <StatementLines
                label="Percentage tax"
                lines={[
                  { label: "Gross receipts (including tax withheld)", amount: business.base },
                  {
                    label: business.waivedByEightPercent
                      ? "Percentage tax — not due under the 8% option"
                      : `Percentage tax at ${pct(business.rate)}`,
                    amount: business.due,
                    kind: "total",
                  },
                ]}
              />
            )}
          </section>
          <section aria-labelledby="withholding" className="space-y-2">
            <h3 className="text-sm font-semibold" id="withholding">
              Withholding
            </h3>
            <StatementLines
              label="Withholding"
              lines={[
                {
                  label: `Tax withheld by clients — credit on ${forms.quarterly}`,
                  amount: cwt.withheld,
                  href: `/finance/withholding?${windowQuery(window)}`,
                },
                { label: "2307 in hand", amount: cwt.received, indent: true },
                {
                  label: "2307 still to collect",
                  amount: cwt.pending,
                  indent: true,
                  href: `/finance/withholding?status=pending&${windowQuery(window)}`,
                },
                {
                  label: "EWT you withheld from suppliers — 0619E / 1601EQ",
                  amount: ewt.withheld,
                },
                { label: "Not yet remitted", amount: ewt.unremitted, indent: true },
              ]}
            />
          </section>
        </div>

        <section aria-labelledby="elections" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold" id="elections">
              Income tax by election — {forms.quarterly} / {forms.annual}
            </h3>
            <span className="text-xs text-muted-foreground">
              Itemized deductions: {formatPhpExact(statement.tax.allowableDeductions)} (excludes at-risk amounts)
            </span>
          </div>
          <Table aria-label="Income tax by election">
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Income tax</TableHead>
                <TableHead className="text-right">Percentage tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {elections.map((row) => (
                <TableRow className={cn(!row.eligible && "text-muted-foreground")} key={row.option}>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.label}
                      {row.elected ? <Badge>Elected</Badge> : null}
                      {row.lowest ? <Badge variant="secondary">Lowest</Badge> : null}
                    </span>
                    {row.reason ? <span className="block text-xs">{row.reason}</span> : null}
                  </TableCell>
                  <MoneyCell value={row.taxableIncome} />
                  <MoneyCell value={row.incomeTax} />
                  <MoneyCell value={row.percentageTax} />
                  <MoneyCell className="font-semibold" value={row.totalTax} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs leading-5 text-muted-foreground">
            {annual
              ? "The 8% exemption, the brackets and the VAT threshold are annual, so a full or year-to-date period compares fairly. 1701Q is cumulative: use year to date."
              : "The 8% exemption, the brackets and the VAT threshold are annual. For a fair comparison pick a full year, or year to date for the cumulative 1701Q."}{" "}
            {settings.incomeTaxElection
              ? null
              : "No election is recorded yet — set it in Tax settings once chosen."}
          </p>
        </section>

        <section aria-labelledby="monthly" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold" id="monthly">
              By month
            </h3>
            <Button asChild className="print:hidden" size="sm" variant="ghost">
              <a download href={exportHref("monthly", window)}>
                <Download /> CSV
              </a>
            </Button>
          </div>
          <Table aria-label="By month">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Net receipts</TableHead>
                <TableHead className="text-right">Output VAT</TableHead>
                <TableHead className="text-right">Expenses (net)</TableHead>
                <TableHead className="text-right">Creditable input VAT</TableHead>
                <TableHead className="text-right">EWT withheld</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statement.monthly.map((month) => (
                <TableRow key={month.month}>
                  <TableCell>{formatDateKey(`${month.month}-01`, "month")}</TableCell>
                  <MoneyCell value={month.netReceipts} />
                  <MoneyCell value={month.outputVat} />
                  <MoneyCell value={month.expensesNet} />
                  <MoneyCell value={month.creditableInputVat} />
                  <MoneyCell value={month.ewt} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Block E — exceptions
// ---------------------------------------------------------------------------
const EXCEPTION_ROW_LIMIT = 12;

function exceptionHref(row: ExceptionRow) {
  if (row.recordType === "expense") return `/finance/expenses/${row.recordId}`;
  if (row.recordType === "certificate") return `/finance/withholding/${row.recordId}`;
  return "/finance/assets/new";
}

export function ExceptionsBlock({ statement, window }: BlockProps) {
  const { groups } = statement.exceptions;
  return (
    <Card id="exceptions">
      <BlockHeader
        description="Entries that would weaken the statement on audit. Fix these before the accountant reads the numbers."
        exportType="exceptions"
        title="E. Exceptions"
        window={window}
      />
      <CardContent className="pt-4">
        {groups.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No exceptions for this period</EmptyTitle>
              <EmptyDescription>
                Every expense has a document, required withholding is remitted, and every active vehicle has a cost.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section aria-labelledby={`exception-${group.kind}`} className="space-y-2" key={group.kind}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold" id={`exception-${group.kind}`}>
                    {group.title}
                  </h3>
                  <StatusBadge
                    label={`${group.severity} · ${group.rows.length}`}
                    status={group.severity === "high" ? "critical" : group.severity === "medium" ? "delayed" : "draft"}
                  />
                  {group.total > 0 ? (
                    <span className="text-xs text-muted-foreground">{formatPhpExact(group.total)}</span>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{group.why}</p>
                <ul className="divide-y rounded-md border text-sm">
                  {group.rows.slice(0, EXCEPTION_ROW_LIMIT).map((row) => (
                    <li className="flex items-center justify-between gap-4 px-3 py-2" key={`${row.kind}-${row.recordId}`}>
                      <Link className="min-w-0 truncate underline-offset-4 hover:underline" href={exceptionHref(row)}>
                        {row.label || "Untitled"}
                      </Link>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        {row.occurredOn ? formatDateKey(row.occurredOn) : null}
                        {row.amount !== null ? (
                          <span className="font-mono tabular-nums text-foreground">{formatPhpExact(row.amount)}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {group.rows.length > EXCEPTION_ROW_LIMIT ? (
                  <p className="text-xs text-muted-foreground">
                    {group.rows.length - EXCEPTION_ROW_LIMIT} more in the CSV export.
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
