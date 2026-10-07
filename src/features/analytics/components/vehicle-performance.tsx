import Link from "next/link";
import { CarFront, Hourglass } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import {
  Card,
  CardAction,
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
import {
  IDLE_VEHICLE_THRESHOLD_DAYS,
  idleVehicles,
  utilizationPercent,
} from "@/features/analytics/lib/analytics-metrics";
import { listVehiclePerformance } from "@/features/analytics/services/list-vehicle-performance";
import type { AnalyticsWindow } from "@/features/analytics/types/analytics";
import { PanelError } from "@/features/analytics/components/panel-error";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";

export async function VehiclePerformancePanel({ window }: { window: AnalyticsWindow }) {
  const result = await listVehiclePerformance(window.from, window.to);
  if (!result.ok) return <PanelError message={result.message} title="Car performance" />;

  const rows = result.data;
  const idle = idleVehicles(rows);

  return (
    <section aria-labelledby="analytics-cars" className="space-y-4">
      <h2 className="text-lg font-semibold" id="analytics-cars">
        Cars
      </h2>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-9">
          <CardHeader>
            <CardTitle>Performance by car</CardTitle>
            <CardDescription>
              Ranked by money collected in the period. Utilization is days rented out of{" "}
              {window.days} days.
            </CardDescription>
            <CardAction>
              <ExportRowsButton
                fileName="vehicle-performance"
                sheets={[
                  {
                    name: "Performance by car",
                    columns: [
                      { key: "plateNumber", header: "Plate number" },
                      { key: "name", header: "Car" },
                      { key: "category", header: "Category" },
                      { key: "status", header: "Status", format: "status" },
                      { key: "rentalCount", header: "Rentals", format: "number" },
                      { key: "utilization", header: "Utilization", format: "percent" },
                      { key: "collected", header: "Collected", format: "money" },
                      { key: "perDay", header: "Per day", format: "money" },
                      { key: "charges", header: "Charges", format: "money" },
                    ],
                    rows: rows.map((row) => {
                      const utilization = utilizationPercent(row.rentedDays, row.windowDays);
                      return {
                        plateNumber: row.plateNumber,
                        name: row.name,
                        category: row.category,
                        status: row.onRentNow ? "rented" : row.status,
                        rentalCount: row.rentalCount,
                        utilization: utilization === null ? null : utilization / 100,
                        collected: row.collected,
                        perDay: row.windowDays ? row.collected / row.windowDays : 0,
                        charges: row.penaltiesBilled,
                      };
                    }),
                  },
                ]}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            {rows.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Car</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rentals</TableHead>
                      <TableHead className="min-w-36">Utilization</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Per day</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const utilization = utilizationPercent(row.rentedDays, row.windowDays) ?? 0;
                      return (
                        <TableRow key={row.vehicleId}>
                          <TableCell>
                            <Link
                              className="font-medium hover:underline"
                              href={`/vehicles/${row.vehicleId}`}
                            >
                              {row.plateNumber}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              {row.name}
                              {row.category ? ` · ${row.category}` : ""}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={row.onRentNow ? "On rent" : undefined}
                              status={row.onRentNow ? "rented" : row.status}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.rentalCount}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div aria-hidden="true" className="h-1.5 flex-1 rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-chart-1"
                                  style={{ width: `${utilization}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs tabular-nums">
                                {utilization}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPhp(row.collected)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPhp(row.windowDays ? row.collected / row.windowDays : 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPhp(row.penaltiesBilled)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CarFront />
                  </EmptyMedia>
                  <EmptyTitle>No cars yet</EmptyTitle>
                  <EmptyDescription>Add vehicles to see how each one performs.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-gold-50 text-gold-700">
              <Hourglass aria-hidden="true" className="size-5" />
            </div>
            <CardTitle>Sitting idle</CardTitle>
            <CardDescription>
              Available cars with nothing booked and no rental in the last{" "}
              {IDLE_VEHICLE_THRESHOLD_DAYS} days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {idle.length ? (
              <ul className="divide-y rounded-md border">
                {idle.map((row) => (
                  <li className="px-3 py-2.5" key={row.vehicleId}>
                    <Link className="text-sm font-medium hover:underline" href={`/vehicles/${row.vehicleId}`}>
                      {row.plateNumber} · {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.idleDays === null
                        ? "Never rented"
                        : `Idle ${row.idleDays} days · back ${formatManila(row.lastReturnAt!, "dateTime")}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Every available car has been out recently or has a booking ahead.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
