import "server-only";

import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { describeError } from "@/features/analytics/lib/analytics-error";
import { parseVehicleOverview, type VehicleOverview } from "@/features/vehicles/lib/vehicle-overview";

export type VehicleOverviewResult = { ok: true; data: VehicleOverview } | { ok: false; message: string };

export async function getVehicleOverview(
  vehicleId: string,
  window: { from: string; to: string },
): Promise<VehicleOverviewResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("vehicle_overview", {
      p_vehicle_id: vehicleId,
      p_from: window.from,
      p_to: window.to,
    });
    if (error) throw error;
    return { ok: true, data: parseVehicleOverview(data ?? {}) };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`Vehicle overview failed: ${describeError(error)}`);
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "PGRST202" || code === "42883") {
      return { ok: false, message: "This view needs the latest database migration. Apply supabase/migrations and reload." };
    }
    if (code === "42501") return { ok: false, message: "Vehicle analytics are available to owners and admins only." };
    return { ok: false, message: "The overview could not load. Reload the page to try again." };
  }
}
