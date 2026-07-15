import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LocationRow = Record<string, unknown> & {
  id?: string;
  vehicle_id: string;
};

function timestamp(row: LocationRow) {
  return String(row.device_time ?? row.created_at ?? "");
}

export async function listLatestLocations(): Promise<LocationRow[]> {
  if (!isSupabaseConfigured())
    return [
      {
        vehicle_id: "demo-vehicle",
        latitude: 14.5995,
        longitude: 120.9842,
        speed_kph: 37,
        device_time: "2026-07-15T01:15:00Z",
        received_at: "2026-07-15T01:15:04Z",
        status: "moving",
      },
    ];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_latest_locations")
    .select(
      "vehicle_id, gps_device_id, latitude, longitude, speed_kph, heading, ignition, motion, gps_valid, device_time, server_time, received_at, updated_at",
    )
    .order("device_time", { ascending: false })
    .limit(250);
  if (error) throw new Error(error.message);
  return (data ?? []) as LocationRow[];
}

export async function listVehicleRoute(
  vehicleId: string,
): Promise<LocationRow[]> {
  if (!isSupabaseConfigured())
    return [
      {
        id: "p1",
        vehicle_id: vehicleId,
        latitude: 14.5832,
        longitude: 120.9794,
        speed_kph: 22,
        device_time: "2026-07-15T00:48:00Z",
        received_at: "2026-07-15T00:48:03Z",
      },
      {
        id: "p2",
        vehicle_id: vehicleId,
        latitude: 14.5915,
        longitude: 120.9821,
        speed_kph: 35,
        device_time: "2026-07-15T01:01:00Z",
        received_at: "2026-07-15T01:01:04Z",
      },
      {
        id: "p3",
        vehicle_id: vehicleId,
        latitude: 14.5995,
        longitude: 120.9842,
        speed_kph: 18,
        device_time: "2026-07-15T01:15:00Z",
        received_at: "2026-07-15T01:15:04Z",
      },
    ];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_location_history")
    .select(
      "id, vehicle_id, gps_device_id, rental_id, latitude, longitude, speed_kph, heading, ignition, motion, gps_valid, device_time, server_time, received_at, created_at",
    )
    .eq("vehicle_id", vehicleId)
    .order("device_time", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LocationRow[]).sort((a, b) =>
    timestamp(a).localeCompare(timestamp(b)),
  );
}

export function locationTimestamp(row: LocationRow) {
  return timestamp(row);
}
