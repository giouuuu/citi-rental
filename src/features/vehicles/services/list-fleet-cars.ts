import "server-only";

import type { FleetCar } from "@/features/vehicles/components/fleet-bookings-calendar";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Cars for the fleet calendar's filter, retired ones left out. */
export async function listFleetCars(): Promise<FleetCar[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, plate_number, name")
    .neq("status", "inactive")
    .order("plate_number");
  // The calendar still works without the filter list; don't break the page.
  if (error) {
    console.error("listFleetCars failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    plateNumber: String(row.plate_number),
    name: row.name ? String(row.name) : null,
  }));
}
