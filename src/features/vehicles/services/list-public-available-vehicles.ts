import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { manilaDateKey } from "@/features/shared/lib/manila-time";
import { VEHICLE_GALLERY_KINDS } from "@/features/vehicles/lib/vehicle-gallery";
import type {
  PublicFleetVehicle,
  PublicListedVehicle,
  PublicVehiclePhoto,
} from "@/features/vehicles/types/public-fleet-vehicle";

type PublicFleetVehicleRow = {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  category: string | null;
  transmission: PublicFleetVehicle["transmission"];
  fuel_type: PublicFleetVehicle["fuel_type"];
  seating_capacity: number | null;
  photo_url: string | null;
  daily_rate: number | string;
  half_day_rate?: number | string | null;
  hourly_rate?: number | string | null;
  // Optional until the showcase-image migration reaches the database.
  color?: string | null;
  showcase_image_url?: string | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function asDateOnly(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return manilaDateKey(date);
}

export type ListPublicAvailableVehiclesOptions = {
  startDate?: string | null;
  endDate?: string | null;
};

export async function listPublicAvailableVehicles(
  options: ListPublicAvailableVehiclesOptions = {},
): Promise<PublicListedVehicle[]> {
  if (!isSupabaseConfigured()) return [];

  const startDate = asDateOnly(options.startDate);
  const endDate = asDateOnly(options.endDate);
  const hasDateFilter = Boolean(startDate && endDate && endDate >= startDate);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_public_available_vehicles",
    hasDateFilter
      ? { p_start_date: startDate, p_end_date: endDate }
      : {},
  );

  if (error || !data) {
    console.error("list_public_available_vehicles failed", error?.message);
    return [];
  }

  const rows = data as PublicFleetVehicleRow[];
  const galleries = await listGalleries(
    supabase,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: Number(row.year),
    category: row.category,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    seating_capacity: row.seating_capacity,
    photo_url: row.photo_url,
    daily_rate: Number(row.daily_rate),
    half_day_rate: row.half_day_rate != null ? Number(row.half_day_rate) : null,
    hourly_rate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    color: row.color ?? null,
    showcase_image_url: row.showcase_image_url ?? null,
    gallery: galleries.get(row.id) ?? [],
  }));
}

/**
 * Gallery angles per car, in slot order (front first). A failure only costs
 * the lightbox: cards still show their cover photo.
 */
async function listGalleries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleIds: string[],
) {
  const galleries = new Map<string, PublicVehiclePhoto[]>();
  if (!vehicleIds.length) return galleries;

  const { data, error } = await supabase
    .from("vehicle_photos")
    .select("vehicle_id, kind, public_url")
    .in("vehicle_id", vehicleIds);
  if (error || !data) {
    console.error("vehicle_photos lookup failed", error?.message);
    return galleries;
  }

  for (const slot of VEHICLE_GALLERY_KINDS) {
    for (const photo of data) {
      if (photo.kind !== slot.value || !photo.public_url) continue;
      const list = galleries.get(photo.vehicle_id) ?? [];
      list.push({ kind: slot.value, label: slot.label, url: photo.public_url });
      galleries.set(photo.vehicle_id, list);
    }
  }
  return galleries;
}
