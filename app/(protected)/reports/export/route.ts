import { NextRequest, NextResponse } from "next/server";

import { toCsv } from "@/features/reports/lib/to-csv";
import { getVehicleRevenueReport } from "@/features/reports/services/get-vehicle-revenue-report";
import { resolveReportWindow } from "@/features/reports/lib/report-window";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { toXlsx, xlsxResponse, type XlsxColumn } from "@/features/shared/lib/to-xlsx";
import { createClient } from "@/lib/supabase/server";

const revenueColumns: XlsxColumn[] = [
  { key: "plateNumber", header: "Plate" },
  { key: "vehicleName", header: "Vehicle" },
  { key: "rentalCount", header: "Rentals", format: "number" },
  { key: "rentedDays", header: "Days out", format: "number" },
  { key: "utilizationPercent", header: "Utilization", format: "percent" },
  { key: "quotedTotal", header: "Quoted", format: "money" },
  { key: "collected", header: "Collected", format: "money" },
  { key: "penalties", header: "Penalties", format: "money" },
  { key: "outstanding", header: "Outstanding", format: "money" },
];

const rentalColumns: XlsxColumn[] = [
  { key: "reference_number", header: "Reference" },
  { key: "status", header: "Status", format: "status" },
  { key: "customer_id", header: "Customer ID" },
  { key: "vehicle_id", header: "Vehicle ID" },
  { key: "start_at", header: "Start", format: "datetime" },
  { key: "expected_return_at", header: "Expected return", format: "datetime" },
  { key: "actual_return_at", header: "Actual return", format: "datetime" },
  { key: "pickup_location", header: "Pickup location" },
  { key: "return_location", header: "Return location" },
  { key: "starting_odometer", header: "Starting odometer", format: "number" },
  { key: "ending_odometer", header: "Ending odometer", format: "number" },
  { key: "starting_fuel_level", header: "Starting fuel" },
  { key: "ending_fuel_level", header: "Ending fuel" },
  { key: "created_at", header: "Created", format: "datetime" },
  { key: "updated_at", header: "Updated", format: "datetime" },
  { key: "id", header: "ID" },
];

const vehicleColumns: XlsxColumn[] = [
  { key: "plate_number", header: "Plate" },
  { key: "name", header: "Name" },
  { key: "make", header: "Make" },
  { key: "model", header: "Model" },
  { key: "year", header: "Year" },
  { key: "category", header: "Category" },
  { key: "transmission", header: "Transmission" },
  { key: "fuel_type", header: "Fuel type" },
  { key: "seating_capacity", header: "Seats", format: "number" },
  { key: "current_odometer", header: "Odometer", format: "number" },
  { key: "status", header: "Status", format: "status" },
  { key: "created_at", header: "Created", format: "datetime" },
  { key: "updated_at", header: "Updated", format: "datetime" },
  { key: "id", header: "ID" },
];

const tableReports = {
  rentals: {
    table: "rentals",
    name: "rental-history",
    columns:
      "id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, actual_return_at, pickup_location, return_location, starting_odometer, ending_odometer, starting_fuel_level, ending_fuel_level, status, created_at, updated_at",
  },
  vehicles: {
    table: "vehicles",
    name: "vehicles",
    columns:
      "id, plate_number, name, make, model, year, category, transmission, fuel_type, seating_capacity, current_odometer, status, created_at, updated_at",
  },
} as const;

function sheetResponse(
  asXlsx: boolean,
  rows: Record<string, unknown>[],
  columns: XlsxColumn[],
  name: string,
  sheetName: string,
) {
  if (!asXlsx) return csvResponse(toCsv(rows), name);
  return toXlsx([{ name: sheetName, columns, rows }]).then((workbook) =>
    xlsxResponse(workbook, name),
  );
}

function csvResponse(csv: string, name: string) {
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const asXlsx = params.get("format") === "xlsx";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (!profile?.is_active || !isAdminRole(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Revenue reads through the same service the screen uses, so the CSV and the
  // on-screen table can never disagree for the same filters.
  if (type === "revenue") {
    const { from, to } = resolveReportWindow({
      from: params.get("from"),
      to: params.get("to"),
    });
    const rows = await getVehicleRevenueReport({
      from,
      to,
      vehicleId: params.get("vehicle_id"),
    });
    return sheetResponse(
      asXlsx,
      // Utilization is a whole percent in the service; Excel's percent format wants a fraction.
      asXlsx
        ? rows.map((row) => ({ ...row, utilizationPercent: row.utilizationPercent / 100 }))
        : (rows as unknown as Record<string, unknown>[]),
      revenueColumns,
      "vehicle-revenue",
      "Vehicle revenue",
    );
  }

  if (type !== "rentals" && type !== "vehicles")
    return NextResponse.json({ error: "Unknown report type." }, { status: 400 });

  // Branched rather than `.from(report.table)` — a dynamic table name widens
  // the generated Supabase types into a union TS cannot represent.
  const report = tableReports[type];
  const { data, error } =
    type === "rentals"
      ? await supabase
          .from("rentals")
          .select(tableReports.rentals.columns)
          .limit(10000)
      : await supabase
          .from("vehicles")
          .select(tableReports.vehicles.columns)
          .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return sheetResponse(
    asXlsx,
    (data ?? []) as unknown as Record<string, unknown>[],
    type === "rentals" ? rentalColumns : vehicleColumns,
    report.name,
    type === "rentals" ? "Rental history" : "Fleet",
  );
}
