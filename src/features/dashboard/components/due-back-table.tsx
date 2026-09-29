"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/design-system/status-badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { DashboardRental } from "@/features/dashboard/types/dashboard";
import { formatManila } from "@/features/shared/client";

const columns: ColumnDef<DashboardRental>[] = [
  {
    accessorKey: "reference",
    header: "Reference",
    cell: ({ row }) => (
      <Link className="font-mono text-xs font-medium hover:underline" href={`/rentals/${row.original.id}`}>
        {row.original.reference}
      </Link>
    ),
  },
  { accessorKey: "customerName", header: "Customer" },
  {
    accessorKey: "vehiclePlate",
    header: "Car",
    cell: ({ row }) => (
      <span>
        <span className="font-mono text-xs">{row.original.vehiclePlate}</span>
        <span className="block text-xs text-muted-foreground">{row.original.vehicleName}</span>
      </span>
    ),
  },
  {
    accessorKey: "expectedReturnAt",
    header: "Due back",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatManila(row.original.expectedReturnAt, "time")}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function DueBackTable({ rentals }: { rentals: DashboardRental[] }) {
  return (
    <DataTable
      columns={columns}
      data={rentals}
      emptyMessage={
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheck />
            </EmptyMedia>
            <EmptyTitle>No returns due today</EmptyTitle>
            <EmptyDescription>Cars due back later this week show on their rental.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      pagination={false}
    />
  );
}
