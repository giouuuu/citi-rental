import Link from "next/link";
import { KeyRound } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CUSTOMER_RENTAL_LIMIT,
  isLateReturn,
  rentalOutstanding,
  summarizeCustomerRentals,
} from "@/features/customers/lib/summarize-customer-rentals";
import type { CustomerRental } from "@/features/customers/types/customer-rental";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";

export function CustomerRentalHistory({ rentals }: { rentals: CustomerRental[] }) {
  if (!rentals.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>No rentals yet</EmptyTitle>
          <EmptyDescription>This customer&apos;s bookings will appear here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/rentals/new">New rental</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const summary = summarizeCustomerRentals(rentals);
  const figures = [
    { label: "Rentals", value: String(summary.rentals) },
    { label: "Lifetime value", value: formatPhp(summary.lifetimeValue) },
    { label: "Owes", value: formatPhp(summary.outstanding), alert: summary.outstanding > 0 },
    { label: "Late returns", value: String(summary.lateReturns), alert: summary.lateReturns > 0 },
    { label: "Average rental", value: summary.averageDays === null ? "—" : `${summary.averageDays} days` },
    { label: "Customer since", value: summary.firstRentalAt ? formatManila(summary.firstRentalAt, "date") : "—" },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {figures.map((figure) => (
          <div className="rounded-lg border bg-card p-4" key={figure.label}>
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums ${figure.alert ? "text-destructive" : ""}`}>
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <Card>
        <CardHeader>
          <CardTitle>Rental history</CardTitle>
          <CardDescription>
            Newest first{rentals.length >= CUSTOMER_RENTAL_LIMIT ? ` · latest ${CUSTOMER_RENTAL_LIMIT} shown` : ""}.
            {summary.cancellations ? ` ${summary.cancellations} cancelled.` : ""}
          </CardDescription>
          <CardAction>
            <ExportRowsButton
              fileName="rental-history"
              sheets={[
                {
                  name: "Rental history",
                  columns: [
                    { key: "reference", header: "Reference" },
                    { key: "plate", header: "Plate" },
                    { key: "car", header: "Car" },
                    { key: "startAt", header: "Start", format: "datetime" },
                    { key: "endAt", header: "Return", format: "datetime" },
                    { key: "late", header: "Returned late" },
                    { key: "status", header: "Status" },
                    { key: "quoted", header: "Quoted", format: "money" },
                    { key: "collected", header: "Collected", format: "money" },
                    { key: "owes", header: "Owes", format: "money" },
                  ],
                  rows: rentals.map((rental) => ({
                    reference: rental.reference,
                    plate: rental.vehiclePlate,
                    car: rental.vehicleName,
                    startAt: rental.startAt,
                    endAt: rental.actualReturnAt ?? rental.expectedReturnAt,
                    late: isLateReturn(rental) ? "Yes" : "No",
                    status: rental.status.charAt(0).toUpperCase() + rental.status.slice(1).replaceAll("_", " "),
                    quoted: rental.quotedTotal,
                    collected: rental.collected,
                    owes: rentalOutstanding(rental),
                  })),
                },
              ]}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Car</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Owes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rentals.map((rental) => {
                const owes = rentalOutstanding(rental);
                return (
                  <TableRow key={rental.id}>
                    <TableCell>
                      <Link className="font-mono text-xs font-medium hover:underline" href={`/rentals/${rental.id}`}>
                        {rental.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{rental.vehiclePlate}</span>
                      <span className="block text-xs text-muted-foreground">{rental.vehicleName}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatManila(rental.startAt)} → {formatManila(rental.actualReturnAt ?? rental.expectedReturnAt)}
                      {isLateReturn(rental) ? <span className="block font-medium text-destructive">Returned late</span> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={rental.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(rental.quotedTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(rental.collected)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${owes > 0 ? "font-medium text-destructive" : ""}`}>
                      {formatPhp(owes)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
