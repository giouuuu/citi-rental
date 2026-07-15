import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const reports = {
  rentals: {
    table: "rentals",
    name: "rental-history",
    columns:
      "id, reference_number, customer_id, vehicle_id, start_at, expected_return_at, actual_return_at, pickup_location, return_location, starting_odometer, ending_odometer, starting_fuel_level, ending_fuel_level, status, created_at, updated_at",
  },
  events: {
    table: "tracking_events",
    name: "tracking-events",
    columns:
      "id, vehicle_id, gps_device_id, rental_id, geofence_id, event_type, severity, event_timestamp, latitude, longitude, speed_kph, is_acknowledged, acknowledged_at, resolution_note, created_at",
  },
  locations: {
    table: "vehicle_location_history",
    name: "vehicle-trip-points",
    columns:
      "id, vehicle_id, gps_device_id, rental_id, latitude, longitude, speed_kph, heading, ignition, motion, gps_valid, device_time, server_time, received_at",
  },
  vehicles: {
    table: "vehicles",
    name: "vehicles",
    columns:
      "id, plate_number, name, make, model, year, category, transmission, fuel_type, seating_capacity, current_odometer, status, created_at, updated_at",
  },
} as const;

function csvCell(value: unknown) {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as
    | keyof typeof reports
    | null;
  if (!type || !reports[type])
    return NextResponse.json(
      { error: "Unknown report type." },
      { status: 400 },
    );
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
  const report = reports[type];
  const result =
    type === "rentals"
      ? await supabase
          .from("rentals")
          .select(reports.rentals.columns)
          .limit(10000)
      : type === "events"
        ? await supabase
            .from("tracking_events")
            .select(reports.events.columns)
            .limit(10000)
        : type === "locations"
          ? await supabase
              .from("vehicle_location_history")
              .select(reports.locations.columns)
              .limit(10000)
          : await supabase
              .from("vehicles")
              .select(reports.vehicles.columns)
              .limit(10000);
  const { data, error } = result;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(","),
    ),
  ].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${report.name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
