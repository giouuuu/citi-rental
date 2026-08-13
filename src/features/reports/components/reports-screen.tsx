import Link from "next/link";
import { CarFront, Download, FileSpreadsheet, KeyRound } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
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
import { ReportFilters } from "@/features/reports/components/report-filters";
import { resolveReportWindow } from "@/features/reports/lib/report-window";
import { getVehicleRevenueReport } from "@/features/reports/services/get-vehicle-revenue-report";
import { getReportSummary } from "@/features/reports/services/report-service";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const tableExports = [
  {
    type: "rentals",
    title: "Rental history",
    description: "Active, overdue, completed, and cancelled rental records.",
    icon: KeyRound,
  },
  {
    type: "vehicles",
    title: "Fleet source data",
    description: "Vehicle records and current odometer readings.",
    icon: CarFront,
  },
];

const dayFormatter = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

async function listVehicleOptions() {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select("id, name, plate_number")
    .order("plate_number");
  return (data ?? []).map((vehicle) => ({
    id: vehicle.id as string,
    label: [vehicle.plate_number, vehicle.name].filter(Boolean).join(" · "),
  }));
}

export async function ReportsScreen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const readParam = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };

  const vehicleId = readParam("vehicle_id");
  const window = resolveReportWindow({
    from: readParam("from"),
    to: readParam("to"),
  });

  const [summary, vehicles, rows] = await Promise.all([
    getReportSummary(),
    listVehicleOptions(),
    getVehicleRevenueReport({
      from: window.from,
      to: window.to,
      vehicleId,
    }),
  ]);

  const exportHref = `/reports/export?type=revenue&from=${window.fromValue}&to=${window.toValue}${
    vehicleId ? `&vehicle_id=${vehicleId}` : ""
  }`;
  const activeVehicleLabel =
    vehicles.find((vehicle) => vehicle.id === vehicleId)?.label ?? "all vehicles";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Reports" },
        ]}
        description="Rental exports use organization-scoped data and Philippine display time while retaining UTC source timestamps."
        title="Reports"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active rentals" value={String(summary.activeRentals)} />
        <Metric label="Overdue rentals" value={String(summary.overdueRentals)} />
        <Metric label="Returns due today" value={String(summary.returnsDueToday)} />
        <Metric
          label="Revenue this month"
          value={formatPhp(summary.revenueThisMonth)}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Revenue and utilization by vehicle</CardTitle>
          <CardDescription>
            Showing: {dayFormatter.format(window.from)} –{" "}
            {dayFormatter.format(window.to)}, {activeVehicleLabel}. Penalties are
            fuel and damage charges billed at return inspection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <ReportFilters
              fromValue={window.fromValue}
              toValue={window.toValue}
              vehicleId={vehicleId}
              vehicles={vehicles}
            />
            <Button asChild variant="outline">
              <Link href={exportHref}>
                <Download /> Export CSV
              </Link>
            </Button>
          </div>

          {rows.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Rentals</TableHead>
                    <TableHead className="text-right">Days out</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead className="text-right">Quoted</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Penalties</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.vehicleId}>
                      <TableCell>
                        <span className="font-medium">{row.plateNumber}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.vehicleName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.rentalCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.rentedDays}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.utilizationPercent}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.quotedTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.collected)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.penalties)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.outstanding)}
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
                  <FileSpreadsheet />
                </EmptyMedia>
                <EmptyTitle>No rentals in this window</EmptyTitle>
                <EmptyDescription>
                  No rentals for {activeVehicleLabel} between{" "}
                  {dayFormatter.format(window.from)} and{" "}
                  {dayFormatter.format(window.to)}. Widen the dates or clear the
                  vehicle filter.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {tableExports.map((item) => (
          <Card key={item.type}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <item.icon className="size-5" />
              </div>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/reports/export?type=${item.type}`}>
                  <Download /> Export CSV
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-info/20 bg-info-surface">
        <CardContent className="flex items-start gap-3 py-5">
          <FileSpreadsheet className="mt-0.5 size-5 text-info" />
          <div>
            <p className="font-medium">Large history safeguard</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Exports are capped at 10,000 rows. Use narrower reporting windows
              for larger fleets.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
