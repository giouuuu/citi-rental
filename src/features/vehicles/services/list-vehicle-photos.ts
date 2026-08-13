import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  VehiclePhoto,
  VehiclePhotoKind,
} from "@/features/vehicles/lib/vehicle-gallery";

type VehiclePhotoRow = {
  id: string;
  vehicle_id: string;
  kind: VehiclePhotoKind;
  storage_path: string;
  public_url: string;
};

export async function listVehiclePhotos(
  vehicleId: string,
): Promise<VehiclePhoto[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_photos")
    .select("id, vehicle_id, kind, storage_path, public_url")
    .eq("vehicle_id", vehicleId)
    .order("kind");
  // The gallery is one panel on the vehicle page. Throwing here takes the whole
  // page down — including the form and rental history — so degrade to an empty
  // gallery and log instead, matching listVehicleKnownDamages.
  if (error) {
    console.error("listVehiclePhotos failed", error.message);
    return [];
  }

  return ((data ?? []) as VehiclePhotoRow[]).map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
  }));
}
