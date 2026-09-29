import Link from "next/link";
import { UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { repeatCustomerRate } from "@/features/analytics/lib/analytics-metrics";
import { getAnalyticsOverview } from "@/features/analytics/services/get-analytics-overview";
import { listTopCustomers } from "@/features/analytics/services/list-top-customers";
import type { AnalyticsWindow } from "@/features/analytics/types/analytics";
import { PanelError } from "@/features/analytics/components/panel-error";
import { formatPhp } from "@/features/shared/lib/money";

export async function CustomerInsights({ window }: { window: AnalyticsWindow }) {
  const [overview, top] = await Promise.all([
    getAnalyticsOverview(window.from, window.to),
    listTopCustomers(window.from, window.to, 10),
  ]);
  if (!overview.ok) return <PanelError message={overview.message} title="Customer insights" />;
  if (!top.ok) return <PanelError message={top.message} title="Top customers" />;

  const stats = overview.data;
  const repeatRate = repeatCustomerRate(stats);
  const figures = [
    { label: "Renting this period", value: stats.customersActive },
    { label: "First-time", value: stats.customersNew },
    { label: "Returning", value: stats.customersReturning },
    { label: "Repeat rate", value: repeatRate === null ? "—" : `${repeatRate}%` },
    { label: "Blocked", value: stats.customersBlocked },
  ];

  return (
    <section aria-labelledby="analytics-customers" className="space-y-4">
      <h2 className="text-lg font-semibold" id="analytics-customers">
        Customers
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {figures.map((figure) => (
          <div className="rounded-lg border bg-card p-4" key={figure.label}>
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{figure.value}</dd>
          </div>
        ))}
      </dl>
      <Card>
        <CardHeader>
          <CardTitle>Top customers</CardTitle>
          <CardDescription>
            Ranked by money collected this period. Lifetime columns cover every rental on record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {top.data.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Rentals (period)</TableHead>
                    <TableHead className="text-right">Collected (period)</TableHead>
                    <TableHead className="text-right">Rentals (lifetime)</TableHead>
                    <TableHead className="text-right">Lifetime value</TableHead>
                    <TableHead className="text-right">Owes</TableHead>
                    <TableHead className="text-right">Late returns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.data.map((customer) => (
                    <TableRow key={customer.customerId}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          href={`/customers/${customer.customerId}?tab=rentals`}
                        >
                          {customer.fullName}
                        </Link>
                        {customer.isBlocked ? (
                          <Badge className="ml-2" variant="destructive">
                            Blocked
                          </Badge>
                        ) : null}
                        {customer.phoneNumber ? (
                          <span className="block text-xs text-muted-foreground">
                            {customer.phoneNumber}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{customer.rentalsInWindow}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(customer.collectedInWindow)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{customer.rentalsLifetime}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(customer.collectedLifetime)}
                      </TableCell>
                      <TableCell
                        className={
                          customer.outstanding > 0
                            ? "text-right font-medium text-destructive tabular-nums"
                            : "text-right tabular-nums"
                        }
                      >
                        {formatPhp(customer.outstanding)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {customer.lateReturnsLifetime}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound />
                </EmptyMedia>
                <EmptyTitle>No customer activity in this period</EmptyTitle>
                <EmptyDescription>Widen the date range to see who rents most.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
