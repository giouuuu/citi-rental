import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type PublicVehicleBookedRange = {
  startAt: string;
  expectedReturnAt: string;
};

export async function listPublicVehicleBookedRanges(
  vehicleId: string,
): Promise<PublicVehicleBookedRange[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_public_vehicle_booked_ranges",
    { p_vehicle_id: vehicleId },
  );

  if (error || !data) {
    console.error("list_public_vehicle_booked_ranges failed", error?.message);
    return [];
  }

  return (data as { start_at: string; expected_return_at: string }[]).map(
    (row) => ({
      startAt: String(row.start_at),
      expectedReturnAt: String(row.expected_return_at),
    }),
  );
}
