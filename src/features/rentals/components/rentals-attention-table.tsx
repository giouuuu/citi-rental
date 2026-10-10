import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hoursLate, lateness } from "@/features/dashboard/lib/build-dashboard-snapshot";
import {
  ATTENTION_REASONS,
  type RentalNeedingAttention,
} from "@/features/rentals/lib/attention-reasons";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";

/** What happened and when, in the words the owner acts on. */
function whenLine(rental: RentalNeedingAttention, now: Date) {
  const late = lateness(hoursLate({ expectedReturnAt: rental.dueAt }, now));
  switch (rental.reason) {
    case "overdue":
      return `Due back ${formatManila(rental.dueAt)} · ${late}`;
    case "late_pickup":
      return `Pickup was ${formatManila(rental.dueAt)} · ${late}`;
    case "proof_to_check":
      return `Pickup ${formatManila(rental.startAt)}`;
    case "refund_due":
      return `Cancelled ${formatManila(rental.dueAt)}`;
    case "balance_due":
      return `Returned ${formatManila(rental.dueAt)}`;
  }
}

/** The money that matters for the reason: what was paid for a refund, else what is owed. */
function amountFor(rental: RentalNeedingAttention) {
  return rental.reason === "refund_due" ? rental.amountPaid : rental.billBalance;
}

function amountLabel(rental: RentalNeedingAttention) {
  if (rental.reason === "refund_due") return "paid";
  if (rental.reason === "balance_due") return "owed";
  return "to collect";
}

/**
 * The /rentals to-do list: rentals someone has to act on, above the full
 * list. Small by nature, so it shows every row and exports them client-side.
 */
export function RentalsAttentionTable({
  rentals,
  now = new Date(),
}: {
  rentals: RentalNeedingAttention[];
  now?: Date;
}) {
  const counts = Object.entries(
    rentals.reduce<Record<string, number>>((tally, rental) => {
      const label = ATTENTION_REASONS[rental.reason].label.toLowerCase();
      tally[label] = (tally[label] ?? 0) + 1;
      return tally;
    }, {}),
  )
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ");

  return (
    <Card aria-labelledby="rentals-attention-title" className="gap-4">
      <CardHeader>
        <CardTitle id="rentals-attention-title">Needs attention</CardTitle>
        <CardDescription aria-live="polite">
          {rentals.length ? counts : "Nothing waiting on you right now."}
        </CardDescription>
        {rentals.length ? (
          <CardAction>
            <ExportRowsButton
              fileName="rentals-needing-attention"
              sheets={[
                {
                  name: "Needs attention",
                  columns: [
                    { key: "reason", header: "Reason" },
                    { key: "action", header: "Next step" },
                    { key: "reference", header: "Reference" },
                    { key: "customer", header: "Customer" },
                    { key: "phone", header: "Phone" },
                    { key: "plate", header: "Plate" },
                    { key: "car", header: "Car" },
                    { key: "dueAt", header: "Since", format: "datetime" },
                    { key: "startAt", header: "Pickup", format: "datetime" },
                    { key: "expectedReturnAt", header: "Expected return", format: "datetime" },
                    { key: "status", header: "Status" },
                    { key: "billTotal", header: "Bill", format: "money" },
                    { key: "amountPaid", header: "Paid", format: "money" },
                    { key: "billBalance", header: "Balance", format: "money" },
                  ],
                  rows: rentals.map((rental) => ({
                    reason: ATTENTION_REASONS[rental.reason].label,
                    action: ATTENTION_REASONS[rental.reason].action,
                    reference: rental.reference,
                    customer: rental.customerName,
                    phone: rental.customerPhone,
                    plate: rental.vehiclePlate,
                    car: rental.vehicleName,
                    dueAt: rental.dueAt,
                    startAt: rental.startAt,
                    expectedReturnAt: rental.expectedReturnAt,
                    status: rental.status,
                    billTotal: rental.billTotal,
                    amountPaid: rental.amountPaid,
                    billBalance: rental.billBalance,
                  })),
                },
              ]}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={rentals.length ? "overflow-x-auto px-0" : undefined}>
        {rentals.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Reason</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Car</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-6">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rentals.map((rental) => {
                const meta = ATTENTION_REASONS[rental.reason];
                const amount = amountFor(rental);
                return (
                  <TableRow key={rental.id}>
                    <TableCell className="pl-6 align-top">
                      <StatusBadge className="normal-case" label={meta.label} status={meta.tone} />
                      <span className="mt-1 block max-w-64 text-xs whitespace-normal text-muted-foreground">
                        {meta.action}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-medium">{rental.customerName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {rental.reference}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-mono text-xs">{rental.vehiclePlate}</span>
                      <span className="block text-xs text-muted-foreground">{rental.vehicleName}</span>
                    </TableCell>
                    <TableCell className="align-top text-xs">{whenLine(rental, now)}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {amount > 0 ? (
                        <>
                          <span className="font-medium">{formatPhp(amount)}</span>
                          <span className="block text-xs text-muted-foreground">{amountLabel(rental)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right align-top">
                      <Button asChild size="sm" variant="outline">
                        <Link aria-label={`Open ${rental.reference}`} href={`/rentals/${rental.id}`}>
                          Open <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border border-dashed p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheck />
              </EmptyMedia>
              <EmptyTitle>All caught up</EmptyTitle>
              <EmptyDescription>
                Overdue returns, payment proofs, late pickups, refunds and unpaid balances show here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
