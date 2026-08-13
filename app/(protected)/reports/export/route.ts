import { NextRequest, NextResponse } from "next/server";

import { toCsv } from "@/features/reports/lib/to-csv";
import { getVehicleRevenueReport } from "@/features/reports/services/get-vehicle-revenue-report";
import { resolveReportWindow } from "@/features/reports/lib/report-window";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (!profile?.is_active)
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
    return csvResponse(
      toCsv(rows as unknown as Record<string, unknown>[]),
      "vehicle-revenue",
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

  return csvResponse(
    toCsv((data ?? []) as unknown as Record<string, unknown>[]),
    report.name,
  );
}
