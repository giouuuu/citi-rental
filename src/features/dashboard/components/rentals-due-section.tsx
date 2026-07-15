"use client";

import Link from "next/link";
import { ArrowUpRight, ClockAlert } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
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

type DueRental = {
  reference: string;
  customer: string;
  vehicle: string;
  returnTime: string;
  status: string;
};

const rentals: DueRental[] = [
  {
    reference: "RNT-260713-018",
    customer: "Mika Santos",
    vehicle: "NCR 1842",
    returnTime: "4:30 PM",
    status: "active",
  },
  {
    reference: "RNT-260713-014",
    customer: "Paolo Cruz",
    vehicle: "VAN 5041",
    returnTime: "6:00 PM",
    status: "active",
  },
  {
    reference: "RNT-260712-009",
    customer: "Jessa Lim",
    vehicle: "NCR 7718",
    returnTime: "1:00 PM",
    status: "overdue",
  },
];

const columns: ColumnDef<DueRental>[] = [
  {
    accessorKey: "reference",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reference" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium">
        {row.original.reference}
      </span>
    ),
  },
  {
    accessorKey: "customer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
  },
  {
    accessorKey: "vehicle",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Vehicle" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.vehicle}</span>
    ),
  },
  {
    accessorKey: "returnTime",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Expected return" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.returnTime}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function RentalsDueSection() {
  return (
    <section className="grid gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-8">
        <CardHeader className="border-b">
          <CardTitle>Rentals due today</CardTitle>
          <CardDescription>
            Expected returns in Philippine Standard Time.
          </CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="ghost">
              <Link href="/rentals">All rentals</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rentals} pagination={false} />
        </CardContent>
      </Card>
      <Card className="border-gold-100 bg-gold-50/45 xl:col-span-4">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-gold-100 text-gold-700">
            <ClockAlert className="size-5" />
          </div>
          <CardTitle>Return watch</CardTitle>
          <CardDescription>
            One rental is overdue by 2 hours and 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gold-100 bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-semibold">
                RNT-260712-009
              </span>
              <StatusBadge status="overdue" />
            </div>
            <p className="mt-3 text-sm font-medium">
              NCR 7718 · Mitsubishi Mirage
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last location received 3 minutes ago
            </p>
          </div>
          <Button asChild className="mt-4 w-full" variant="secondary">
            <Link href="/rentals/RNT-260712-009">
              Open rental <ArrowUpRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
