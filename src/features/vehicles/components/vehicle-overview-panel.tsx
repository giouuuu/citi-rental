import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, CircleAlert, HandCoins, Receipt, Wallet } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiTile } from "@/features/analytics/components/kpi-tile";
import { PanelError } from "@/features/analytics/components/panel-error";
import { FinanceFrame } from "@/features/finance/components/finance-frame";
import { FinanceStatementSkeleton } from "@/features/finance/components/finance-skeleton";
import { ProfitChart } from "@/features/finance/components/profit-chart";
import { MoneyCell } from "@/features/finance/components/statement-lines";
import { depreciationBetween, depreciationSchedule, type FixedAsset } from "@/features/finance/lib/depreciation";
import type { FinancePeriodOption, FinanceWindow } from "@/features/finance/lib/finance-period";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatDateKey, formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp, formatPhpExact } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";
import type { VehicleLoanView } from "@/features/vehicles/components/vehicle-financing-panel";
import { VehicleActionButton } from "@/features/vehicles/components/vehicle-action-button";
import type { VehicleActivity } from "@/features/vehicles/lib/vehicle-overview";
import { getVehicleOverview } from "@/features/vehicles/services/get-vehicle-overview";

/** The vehicle page opens on the year so far, like the profit overview. */
export const VEHICLE_OVERVIEW_DEFAULT_PERIOD = "ytd";

type Books = {
  /** The active loan, for the snapshot card. */
  loan: VehicleLoanView | null;
  asset: FixedAsset | null;
};

/**
 * One car's performance over a period: money in, money out, how often it was
 * rented, and everything that happened to it. Owners see costs and profit;
 * admins see income and utilization.
 */
export function VehicleOverviewPanel({
  vehicleId,
  window,
  periodOptions,
  books,
}: {
  vehicleId: string;
  window: FinanceWindow;
  periodOptions: FinancePeriodOption[];
  /** Null for viewers without the books (admins). */
  books: Books | null;
}) {
  return (
    <FinanceFrame
      defaultPeriod={VEHICLE_OVERVIEW_DEFAULT_PERIOD}
      from={window.from}
      options={periodOptions}
      pathname={`/vehicles/${vehicleId}`}
      period={window.period}
      summary={`${window.label}: ${formatDateKey(window.from)} – ${formatDateKey(window.to)}.`}
      to={window.to}
    >
      {/* Unkeyed on purpose: a period change re-renders inside a transition, so
          the previous figures stay up, dimmed, instead of flashing the skeleton. */}
      <Suspense fallback={<FinanceStatementSkeleton />}>
        <OverviewBody books={books} vehicleId={vehicleId} window={window} />
      </Suspense>
    </FinanceFrame>
  );
}

async function OverviewBody({
  vehicleId,
  window,
  books,
}: {
  vehicleId: string;
  window: FinanceWindow;
  books: Books | null;
}) {
  const result = await getVehicleOverview(vehicleId, window);
  if (!result.ok) return <PanelError message={result.message} title="Vehicle overview" />;
  const o = result.data;

  const depreciation =
    o.financeVisible && books?.asset ? depreciationBetween(depreciationSchedule(books.asset), window.from, window.to) : null;
  const perRentedDay = o.rentedDays > 0 ? o.income / o.rentedDays : null;
  const loan = books?.loan ?? null;
  const nextDue = loan?.progress.nextDue ?? null;

  return (
    <>
      {o.financeVisible && o.expenses !== null && o.profit !== null ? (
        <Card>
          <CardContent className="grid gap-6 py-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
            <Figure hint="Rental payments for this car, after refunds and VAT" label="Income" value={o.income} />
            <Operator symbol="−" />
            <Figure
              hint="Servicing, repairs, insurance, loan interest and anything else tagged to this car"
              href={`/finance/expenses?vehicle=${vehicleId}&from=${window.from}&to=${window.to}&status=recorded`}
              label="Car costs"
              value={o.expenses}
            />
            <Operator symbol="=" />
            <Figure
              emphasis={o.profit >= 0 ? "good" : "bad"}
              hint={
                o.marginPercent === null
                  ? "No income in this period"
                  : `${o.profit >= 0 ? "Kept" : "Lost"} ₱${Math.abs(Math.round(o.marginPercent))} of every ₱100 earned`
              }
              label={o.profit >= 0 ? "Profit" : "Loss"}
              value={Math.abs(o.profit)}
            />
          </CardContent>
        </Card>
      ) : null}

      {o.financeVisible && !books?.asset ? (
        <Alert>
          <CircleAlert />
          <AlertTitle>This car has no purchase cost recorded</AlertTitle>
          <AlertDescription>
            <span>Add what you paid for it so its depreciation, usually its biggest deduction, reaches the books.</span>
            <div className="mt-2">
              <VehicleActionButton action="asset" />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Days rented"
          note={`${o.utilizationPercent}% of the ${o.windowDays} days in this period`}
          value={`${o.rentedDays} ${o.rentedDays === 1 ? "day" : "days"}`}
        />
        <KpiTile label="Rentals" note="Bookings on the road during this period" value={String(o.rentalCount)} />
        {o.financeVisible ? (
          <KpiTile
            label="Earned per rented day"
            note="Income divided by days rented"
            value={perRentedDay === null ? "—" : formatPhp(perRentedDay)}
          />
        ) : (
          <KpiTile label="Income" note="Rental payments, after refunds and VAT" value={formatPhp(o.income)} />
        )}
        {depreciation !== null && o.profit !== null ? (
          <KpiTile
            label="Profit after depreciation"
            note={`The car lost about ${formatPhp(depreciation)} in value this period`}
            value={formatPhp(o.profit - depreciation)}
          />
        ) : (
          <KpiTile label="Collected" note="Cash received, VAT included" value={formatPhp(o.collected)} />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Month by month</CardTitle>
            <CardDescription>
              {o.financeVisible
                ? "Income beside this car's costs. The gap between the bars is the month's profit."
                : "Income this car brought in each month."}
            </CardDescription>
            <CardAction>
              <ExportRowsButton
                fileName={`vehicle-by-month-${window.from}-to-${window.to}`}
                sheets={[
                  {
                    name: "By month",
                    columns: [
                      { key: "month", header: "Month" },
                      { key: "rentedDays", header: "Days rented", format: "number" },
                      { key: "income", header: "Income", format: "money" },
                      ...(o.financeVisible
                        ? [
                            { key: "expenses", header: "Costs", format: "money" as const },
                            { key: "profit", header: "Profit", format: "money" as const },
                          ]
                        : []),
                    ],
                    rows: [
                      ...o.monthly.map((month) => ({
                        month: formatDateKey(`${month.month}-01`, "month"),
                        rentedDays: month.rentedDays,
                        income: month.income,
                        expenses: month.expenses,
                        profit: month.profit,
                      })),
                      {
                        month: "Total",
                        rentedDays: o.rentedDays,
                        income: o.income,
                        expenses: o.expenses,
                        profit: o.profit,
                      },
                    ],
                  },
                ]}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfitChart
              rows={o.monthly.map((month) => ({
                label: formatDateKey(`${month.month}-01`, "month"),
                income: month.income,
                expenses: month.expenses ?? 0,
              }))}
              showExpenses={o.financeVisible}
            />
            <Table aria-label="This car by month">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Days rented</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  {o.financeVisible ? (
                    <>
                      <TableHead className="text-right">Costs</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.monthly.map((month) => (
                  <TableRow key={month.month}>
                    <TableCell>{formatDateKey(`${month.month}-01`, "month")}</TableCell>
                    <TableCell className="text-right tabular-nums">{month.rentedDays}</TableCell>
                    <MoneyCell value={month.income} />
                    {month.expenses !== null && month.profit !== null ? (
                      <>
                        <MoneyCell value={month.expenses} />
                        <MoneyCell
                          className={cn("font-semibold", month.profit < 0 && "text-destructive")}
                          value={month.profit}
                        />
                      </>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{o.rentedDays}</TableCell>
                  <MoneyCell value={o.income} />
                  {o.expenses !== null && o.profit !== null ? (
                    <>
                      <MoneyCell value={o.expenses} />
                      <MoneyCell className={cn(o.profit < 0 && "text-destructive")} value={o.profit} />
                    </>
                  ) : null}
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {o.financeVisible ? (
          <div className="space-y-6 xl:col-span-2">
            <LoanSnapshot loan={loan} nextDue={nextDue} />
            <Card>
              <CardHeader>
                <CardTitle>Where this car&apos;s money went</CardTitle>
                <CardDescription>Costs by type, biggest first.</CardDescription>
                <CardAction>
                  <VehicleActionButton action="expense" />
                </CardAction>
              </CardHeader>
              <CardContent>
                {o.categories.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No costs recorded for this car in this period.</p>
                ) : (
                  <ul className="space-y-4">
                    {o.categories.map((category) => (
                      <li className="space-y-1.5" key={category.categoryId}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <Link
                            className="min-w-0 truncate underline-offset-4 hover:underline"
                            href={`/finance/expenses?vehicle=${vehicleId}&category=${category.categoryId}&from=${window.from}&to=${window.to}&status=recorded`}
                          >
                            {category.name}
                          </Link>
                          <span className="shrink-0 font-mono tabular-nums">{formatPhp(category.amount)}</span>
                        </div>
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-chart-4"
                            style={{ width: `${Math.max(category.share, 1)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {category.share}% of costs · {category.entries} {category.entries === 1 ? "entry" : "entries"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      <ActivityCard activity={o.activity} financeVisible={o.financeVisible} vehicleId={vehicleId} />
    </>
  );
}

function LoanSnapshot({
  loan,
  nextDue,
}: {
  loan: VehicleLoanView | null;
  nextDue: VehicleLoanView["progress"]["nextDue"];
}) {
  if (!loan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Car loan</CardTitle>
          <CardDescription>No active loan on this car.</CardDescription>
          <CardAction>
            <VehicleActionButton action="loan" />
          </CardAction>
        </CardHeader>
      </Card>
    );
  }
  const { progress } = loan;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Car loan</CardTitle>
        <CardDescription>
          {loan.loan.lenderName} · {progress.settledCount} of {loan.loan.termMonths} paid
        </CardDescription>
        {nextDue ? (
          <CardAction>
            <VehicleActionButton
              action="payment"
              target={{
                loanId: loan.loan.id,
                lenderName: loan.loan.lenderName,
                termMonths: loan.loan.termMonths,
                installment: nextDue,
              }}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Still owed</p>
          <p className="text-lg font-semibold tabular-nums">{formatPhp(progress.balance)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Next due</p>
          <p className={cn("text-lg font-semibold tabular-nums", progress.overdueCount > 0 && "text-destructive")}>
            {nextDue ? formatDateKey(nextDue.dueDate) : "—"}
          </p>
          {progress.overdueCount > 0 ? (
            <p className="text-xs text-destructive">{progress.overdueCount} overdue</p>
          ) : nextDue ? (
            <p className="text-xs text-muted-foreground">{formatPhpExact(nextDue.payment)}</p>
          ) : null}
        </div>
        <Link className="col-span-2 text-sm font-medium underline-offset-4 hover:underline" href="?tab=financing" scroll={false}>
          See the full schedule
        </Link>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_ICONS = {
  rental: CalendarCheck,
  payment: Wallet,
  expense: Receipt,
  loan_payment: HandCoins,
} as const;

const PAYMENT_LABELS: Record<string, string> = {
  deposit: "Deposit received",
  balance: "Balance received",
  adjustment: "Adjustment",
  refund: "Refund issued",
};

function activityHref(entry: VehicleActivity, vehicleId: string) {
  if (entry.recordType === "rental") return `/rentals/${entry.recordId}`;
  if (entry.recordType === "expense") return `/finance/expenses/${entry.recordId}`;
  return `/vehicles/${vehicleId}?tab=financing`;
}

function activityTitle(entry: VehicleActivity) {
  if (entry.kind === "rental") return `Rental ${entry.label}`;
  if (entry.kind === "payment") return `${PAYMENT_LABELS[entry.detail ?? ""] ?? "Payment"} · ${entry.label}`;
  if (entry.kind === "loan_payment") return `Loan payment · ${entry.label}`;
  return entry.label;
}

function ActivityCard({
  activity,
  vehicleId,
  financeVisible,
}: {
  activity: VehicleActivity[];
  vehicleId: string;
  financeVisible: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          {financeVisible
            ? "Rentals, payments, expenses and loan payments for this car in the period, newest first."
            : "Rentals and payments for this car in the period, newest first."}
          {activity.length >= 60 ? " Showing the latest 60." : ""}
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="vehicle-activity"
            sheets={[
              {
                name: "Activity",
                columns: [
                  { key: "when", header: "When", format: "date" },
                  { key: "what", header: "What" },
                  { key: "detail", header: "Detail" },
                  { key: "status", header: "Status" },
                  { key: "amount", header: "Amount", format: "money" },
                ],
                rows: activity.map((entry) => ({
                  when: entry.occurredAt,
                  what: activityTitle(entry),
                  detail: entry.kind !== "payment" ? entry.detail : null,
                  status:
                    entry.kind === "rental" && entry.status
                      ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1).replaceAll("_", " ")
                      : null,
                  amount:
                    entry.amount === null
                      ? null
                      : entry.kind === "expense" || entry.kind === "loan_payment"
                        ? -Math.abs(entry.amount)
                        : entry.amount,
                })),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck />
              </EmptyMedia>
              <EmptyTitle>Nothing happened in this period</EmptyTitle>
              <EmptyDescription>Pick a longer period above, or record a rental or an expense for this car.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table aria-label="Vehicle activity">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((entry) => {
                const Icon = ACTIVITY_ICONS[entry.kind];
                const outgoing = entry.kind === "expense" || entry.kind === "loan_payment";
                return (
                  <TableRow key={`${entry.kind}-${entry.recordId}-${entry.occurredAt}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatManila(entry.occurredAt, "date")}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Link
                        className="flex items-start gap-2 underline-offset-4 hover:underline"
                        href={activityHref(entry, vehicleId)}
                      >
                        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="font-medium">{activityTitle(entry)}</span>
                          {entry.kind !== "payment" && entry.detail ? (
                            <span className="block text-xs text-muted-foreground">{entry.detail}</span>
                          ) : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {entry.kind === "rental" && entry.status ? <StatusBadge status={entry.status} /> : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        outgoing && "text-muted-foreground",
                        entry.amount !== null && entry.amount < 0 && "text-destructive",
                      )}
                    >
                      {entry.amount === null ? "—" : `${outgoing ? "−" : ""}${formatPhpExact(Math.abs(entry.amount))}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <span aria-hidden="true" className="hidden text-3xl font-light text-muted-foreground lg:block">
      {symbol}
    </span>
  );
}

function Figure({
  label,
  value,
  hint,
  href,
  emphasis,
}: {
  label: string;
  value: number;
  hint: string;
  href?: string;
  emphasis?: "good" | "bad";
}) {
  const amount = (
    <span
      className={cn(
        "block text-3xl leading-tight font-bold tracking-tight tabular-nums",
        emphasis === "good" && "text-success",
        emphasis === "bad" && "text-destructive",
      )}
    >
      {formatPhp(value)}
    </span>
  );
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {href ? (
        <Link className="underline-offset-4 hover:underline" href={href}>
          {amount}
        </Link>
      ) : (
        amount
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
