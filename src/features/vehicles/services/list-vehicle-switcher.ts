import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  websiteListingBlockers,
  type WebsiteListingBlocker,
} from "@/features/vehicles/lib/vehicle-website-listing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VehicleSwitcherEntry = {
  id: string;
  plateNumber: string;
  name: string | null;
  /** Why customers can't book it online; empty when it's listed. */
  blockers: WebsiteListingBlocker[];
};

/**
 * The fleet for the vehicle page's title switcher, each with its website
 * listing status. Archived cars are left out except the one being viewed.
 */
export async function listVehicleSwitcher(currentId: string): Promise<VehicleSwitcherEntry[]> {
  const supabase = await createClient();
  // The id lands in a PostgREST filter string, so only a real UUID gets in.
  const keepCurrent = UUID.test(currentId) ? `,id.eq.${currentId}` : "";
  const [vehicles, photos, company] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate_number, name, status")
      .or(`status.neq.inactive${keepCurrent}`)
      .order("plate_number")
      .limit(500),
    supabase.from("vehicle_photos").select("vehicle_id, kind"),
    supabase.from("company_profile").select("is_active, show_on_public_site").maybeSingle(),
  ]);
  // The switcher is a shortcut; without it the title falls back to plain text.
  if (vehicles.error || !vehicles.data) return [];

  const photosByVehicle = new Map<string, Array<{ kind: string }>>();
  for (const photo of photos.data ?? []) {
    const list = photosByVehicle.get(photo.vehicle_id) ?? [];
    list.push({ kind: photo.kind });
    photosByVehicle.set(photo.vehicle_id, list);
  }
  const siteOn = Boolean(company.data?.is_active && company.data?.show_on_public_site);

  return vehicles.data.map((vehicle) => ({
    id: vehicle.id,
    plateNumber: vehicle.plate_number,
    name: vehicle.name,
    blockers: websiteListingBlockers({
      vehicleId: vehicle.id,
      status: vehicle.status,
      photos: photosByVehicle.get(vehicle.id) ?? [],
      siteOn,
    }),
  }));
}
