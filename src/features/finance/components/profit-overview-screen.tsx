import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Plus } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PanelError } from "@/features/analytics/components/panel-error";
import { FinanceFrame } from "@/features/finance/components/finance-frame";
import { FinanceStatementSkeleton } from "@/features/finance/components/finance-skeleton";
import { ProfitChart } from "@/features/finance/components/profit-chart";
import { MoneyCell } from "@/features/finance/components/statement-lines";
import { financePeriodOptions, resolveFinanceWindow, type FinanceWindow } from "@/features/finance/lib/finance-period";
import type { TaxSettings } from "@/features/finance/lib/income-tax";
import { buildProfitOverview } from "@/features/finance/lib/profit-overview";
import { getFinanceStatement, getTaxSettings } from "@/features/finance/services/finance-service";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { formatPhp, formatPhpExact } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

/** The owner's view opens on the whole year so far. */
const OVERVIEW_DEFAULT_PERIOD = "ytd";

export async function ProfitOverviewScreen({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, settings] = await Promise.all([searchParams, getTaxSettings()]);
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };
  const fiscalStart = settings.fiscalYearStartMonth;
  const window = resolveFinanceWindow(
    { period: read("period"), from: read("from"), to: read("to") },
    fiscalStart,
    new Date(),
    OVERVIEW_DEFAULT_PERIOD,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/finance/expenses/new">
              <Plus /> Record expense
            </Link>
          </Button>
        }
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Finance" }]}
        description="Money in, money out, and what's left."
        title="Profit overview"
      />
      <FinanceFrame
        defaultPeriod={OVERVIEW_DEFAULT_PERIOD}
        from={window.from}
        options={financePeriodOptions(fiscalStart)}
        pathname="/finance"
        period={window.period}
        summary={`${window.label}: ${formatDateKey(window.from)} – ${formatDateKey(window.to)}.`}
        to={window.to}
      >
        <Suspense fallback={<FinanceStatementSkeleton />}>
          <OverviewBody settings={settings} window={window} />
        </Suspense>
      </FinanceFrame>
    </div>
  );
}

function windowQuery(window: FinanceWindow) {
  return `from=${window.from}&to=${window.to}`;
}

async function OverviewBody({ window, settings }: { window: FinanceWindow; settings: TaxSettings }) {
  const result = await getFinanceStatement(window, settings);
  if (!result.ok) return <PanelError message={result.message} title="Profit overview" />;
  const o = buildProfitOverview(result.data);
  const madeMoney = o.profit >= 0;

  return (
    <>
      {/* The one subtraction, as large as the page allows. */}
      <Card>
        <CardContent className="grid gap-6 py-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          <Figure
            hint="Rental payments received, after refunds"
            href={`/finance/report?${windowQuery(window)}`}
            label="Income"
            value={o.income}
          />
          <Operator symbol="−" />
          <Figure
            hint="Everything you paid out"
            href={`/finance/expenses?${windowQuery(window)}&status=recorded`}
            label="Expenses"
            value={o.expenses}
          />
          <Operator symbol="=" />
          <Figure
            emphasis={madeMoney ? "good" : "bad"}
            hint={
              o.marginPercent === null
                ? "No income in this period"
                : `${madeMoney ? "You kept" : "You lost"} ₱${Math.abs(Math.round(o.marginPercent))} of every ₱100 earned`
            }
            label={madeMoney ? "Profit" : "Loss"}
            value={Math.abs(o.profit)}
          />
        </CardContent>
      </Card>

      {o.issues > 0 ? (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {o.issues} {o.issues === 1 ? "record needs" : "records need"} attention
          </AlertTitle>
          <AlertDescription>
            <span>
              Some expenses are missing a receipt or a withholding payment, or a car has no purchase cost recorded. Your
              profit is still right, but your accountant may not be able to use them.{" "}
              <Link className="font-medium underline underline-offset-4" href={`/finance/report?${windowQuery(window)}#exceptions`}>
                See the list
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Month by month</CardTitle>
            <CardDescription>The gap between the two bars is that month&apos;s profit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfitChart
              rows={o.months.map((month) => ({
                label: formatDateKey(`${month.month}-01`, "month"),
                income: month.income,
                expenses: month.expenses,
              }))}
            />
            <Table aria-label="Profit by month">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.months.map((month) => (
                  <TableRow key={month.month}>
                    <TableCell>{formatDateKey(`${month.month}-01`, "month")}</TableCell>
                    <MoneyCell value={month.income} />
                    <MoneyCell value={month.expenses} />
                    <MoneyCell className={cn("font-semibold", month.profit < 0 && "text-destructive")} value={month.profit} />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <MoneyCell value={o.income} />
                  <MoneyCell value={o.expenses} />
                  <MoneyCell className={cn(o.profit < 0 && "text-destructive")} value={o.profit} />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
            <CardDescription>Expenses by type, biggest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {o.categories.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No expenses recorded in this period.</p>
            ) : (
              <ul className="space-y-4">
                {o.categories.map((category) => (
                  <li className="space-y-1.5" key={category.categoryId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        className="min-w-0 truncate underline-offset-4 hover:underline"
                        href={`/finance/expenses?category=${category.categoryId}&${windowQuery(window)}&status=recorded`}
                      >
                        {category.name}
                      </Link>
                      <span className="shrink-0 font-mono tabular-nums">{formatPhp(category.amount)}</span>
                    </div>
                    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-4" style={{ width: `${Math.max(category.share, 1)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{category.share}% of expenses</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profit by car</CardTitle>
          <CardDescription>
            What each car brought in, minus the costs recorded against it (servicing, repairs, fuel). Shared costs such
            as rent and salaries are not split per car.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Profit by car">
            <TableHeader>
              <TableRow>
                <TableHead>Car</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Car costs</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.cars.map((car) => (
                <TableRow key={car.vehicleId}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{car.plateNumber}</span>
                    <span className="block text-xs text-muted-foreground">{car.name}</span>
                  </TableCell>
                  <MoneyCell value={car.income} />
                  <MoneyCell value={car.costs} />
                  <MoneyCell className={cn("font-semibold", car.profit < 0 && "text-destructive")} value={car.profit} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Good to know</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm md:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium">VAT isn&apos;t counted as income</p>
            <p className="text-muted-foreground">
              {o.vatCollected > 0
                ? `You also collected ${formatPhpExact(o.vatCollected)} in VAT. That belongs to BIR, so it's left out of income.`
                : "No VAT was collected in this period."}
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Cars lose value as they age</p>
            <p className="text-muted-foreground">
              {o.depreciation > 0
                ? `Your cars lost about ${formatPhp(o.depreciation)} in value this period. Counting that too, profit would be ${formatPhp(o.profitAfterDepreciation)}. It's a tax deduction, not cash you paid.`
                : "Add each car's purchase price under Fixed assets to see how much value they lose."}
            </p>
          </div>
          <div className="md:col-span-2">
            <Button asChild variant="outline">
              <Link href={`/finance/report?${windowQuery(window)}`}>
                Open the accountant report <ArrowRight />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <span aria-hidden="true" className="hidden text-3xl font-light text-muted-foreground md:block">
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
