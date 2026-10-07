"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, MapPin, Phone } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { StatusBadge, type StatusTone } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lateness } from "@/features/dashboard/lib/build-dashboard-snapshot";
import type { DashboardHandover, HandoverKind } from "@/features/dashboard/types/dashboard";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila, formatPhp } from "@/features/shared/client";

const KIND: Record<HandoverKind, { label: string; tone: StatusTone; action: string }> = {
  overdue: { label: "Overdue", tone: "overdue", action: "Check in" },
  late_pickup: { label: "Late pickup", tone: "delayed", action: "Release" },
  return: { label: "Return", tone: "active", action: "Check in" },
  release: { label: "Release", tone: "reserved", action: "Release" },
};

function place(handover: DashboardHandover) {
  const { rental } = handover;
  const isReturn = handover.kind === "return" || handover.kind === "overdue";
  return (isReturn ? (rental.returnLocation ?? rental.pickupLocation) : rental.pickupLocation) || "—";
}

const columns: ColumnDef<DashboardHandover>[] = [
  {
    id: "when",
    accessorKey: "at",
    header: "When",
    cell: ({ row }) => {
      const { kind, at, lateHours } = row.original;
      // Overdue cars can be days late; their date matters, not just the hour.
      const label = kind === "overdue" ? formatManila(at) : formatManila(at, "time");
      return (
        <span className="flex flex-col items-start gap-1 whitespace-nowrap">
          <StatusBadge label={KIND[kind].label} status={KIND[kind].tone} />
          <span className="tabular-nums">
            {label}
            {lateHours > 0 ? (
              <span className="block text-xs font-medium text-destructive">{lateness(lateHours)}</span>
            ) : null}
          </span>
        </span>
      );
    },
  },
  {
    id: "car",
    accessorFn: (row) => row.rental.vehiclePlate,
    header: "Car · where",
    cell: ({ row }) => (
      <span className="block">
        <span className="font-mono text-xs font-medium">{row.original.rental.vehiclePlate}</span>
        <span className="block text-xs text-muted-foreground">{row.original.rental.vehicleName}</span>
        {place(row.original) !== "—" ? (
          <span className="mt-0.5 flex max-w-44 items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{place(row.original)}</span>
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "customer",
    accessorFn: (row) => row.rental.customerName,
    header: "Customer",
    cell: ({ row }) => {
      const { customerName, customerPhone } = row.original.rental;
      return (
        <span className="block min-w-0">
          <span className="block truncate">{customerName}</span>
          {customerPhone ? (
            <a
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              href={`tel:${customerPhone.replace(/\s+/g, "")}`}
            >
              <Phone aria-hidden="true" className="size-3" />
              {customerPhone}
            </a>
          ) : null}
        </span>
      );
    },
  },
  {
    id: "balance",
    accessorFn: (row) => row.rental.balance,
    header: "To collect",
    cell: ({ row }) =>
      row.original.rental.balance > 0 ? (
        <span className="font-medium tabular-nums">{formatPhp(row.original.rental.balance)}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Paid</span>
      ),
  },
  {
    id: "action",
    header: () => <span className="sr-only">Action</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <Button asChild size="sm" variant={row.original.lateHours > 0 ? "default" : "outline"}>
        <Link href={`/rentals/${row.original.rental.id}`}>{KIND[row.original.kind].action}</Link>
      </Button>
    ),
  },
];

function exportRows(handovers: DashboardHandover[]) {
  return handovers.map((handover) => ({
    handover: KIND[handover.kind].label,
    at: handover.at,
    hoursLate: handover.lateHours || null,
    reference: handover.rental.reference,
    plate: handover.rental.vehiclePlate,
    car: handover.rental.vehicleName,
    customer: handover.rental.customerName,
    phone: handover.rental.customerPhone,
    place: place(handover) === "—" ? null : place(handover),
    balance: handover.rental.balance,
  }));
}

const EXPORT_COLUMNS = [
  { key: "handover", header: "Handover" },
  { key: "at", header: "When", format: "datetime" as const },
  { key: "hoursLate", header: "Hours late", format: "number" as const },
  { key: "reference", header: "Reference" },
  { key: "plate", header: "Plate" },
  { key: "car", header: "Car" },
  { key: "customer", header: "Customer" },
  { key: "phone", header: "Phone" },
  { key: "place", header: "Where" },
  { key: "balance", header: "To collect", format: "money" as const },
];

function HandoverTable({ rows, day }: { rows: DashboardHandover[]; day: "today" | "tomorrow" }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage={
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheck />
            </EmptyMedia>
            <EmptyTitle>No cars going out or coming back {day}</EmptyTitle>
            <EmptyDescription>
              {day === "today"
                ? "Nothing to hand over and nothing overdue."
                : "Tomorrow's schedule is clear so far."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      pagination={false}
    />
  );
}

/**
 * The day sheet: every car going out or coming back, overdue returns and late
 * pickups on top. Tomorrow is one tab away so cars can be prepped the night
 * before.
 */
export function HandoversCard({
  today,
  tomorrow,
}: {
  today: DashboardHandover[];
  tomorrow: DashboardHandover[];
}) {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const rows = day === "today" ? today : tomorrow;
  const counts = (handovers: DashboardHandover[]) => {
    const out = handovers.filter((h) => h.kind === "release" || h.kind === "late_pickup").length;
    return `${out} going out · ${handovers.length - out} coming back`;
  };

  return (
    <Card className="xl:col-span-8">
      <Tabs
        className="gap-(--card-spacing)"
        onValueChange={(value) => setDay(value as "today" | "tomorrow")}
        value={day}
      >
        <CardHeader className="border-b">
          <CardTitle>Handovers</CardTitle>
          <CardDescription>{counts(rows)} · Philippine time</CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <TabsList>
              <TabsTrigger value="today">Today ({today.length})</TabsTrigger>
              <TabsTrigger value="tomorrow">Tomorrow ({tomorrow.length})</TabsTrigger>
            </TabsList>
            <ExportRowsButton
              fileName={`handovers-${day}`}
              sheets={[{ name: `Handovers ${day}`, columns: EXPORT_COLUMNS, rows: exportRows(rows) }]}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <TabsContent value="today">
            <HandoverTable day="today" rows={today} />
          </TabsContent>
          <TabsContent value="tomorrow">
            <HandoverTable day="tomorrow" rows={tomorrow} />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
