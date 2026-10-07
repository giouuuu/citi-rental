import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VehiclePhotoKind } from "@/features/vehicles/lib/vehicle-gallery";

export const VEHICLE_PHOTOS_BUCKET = "vehicle-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("gif")) return "gif";
  return "jpg";
}

export async function uploadVehiclePhoto(options: {
  supabase: SupabaseClient;
  vehicleId: string;
  file: File;
  kind?: VehiclePhotoKind | "cover" | "showcase";
}): Promise<{ path: string; publicUrl: string }> {
  const { supabase, vehicleId, file, kind = "cover" } = options;

  if (!file.size) {
    throw new Error("Choose a vehicle photo to upload.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Vehicle photos must be 5MB or smaller.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }

  const path = `${vehicleId}/${kind}-${Date.now()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;

  const { data } = supabase.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/** Storage path of a `vehicle-photos` public URL, or null for any other URL. */
export function vehiclePhotoPathFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const marker = `/object/public/${VEHICLE_PHOTOS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

/** Best-effort: the row no longer points at it, so a failure only orphans a file. */
async function removeStoredVehiclePhoto(
  supabase: SupabaseClient,
  path: string | null | undefined,
) {
  if (path) await supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove([path]);
}

/**
 * Remove one gallery angle. The front photo doubles as the listing cover, so
 * removing it clears `vehicles.photo_url` too when that still points at it.
 * Returns false when the slot was already empty.
 */
export async function removeVehicleGalleryPhoto({
  supabase,
  vehicleId,
  kind,
}: {
  supabase: SupabaseClient;
  vehicleId: string;
  kind: VehiclePhotoKind;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from("vehicle_photos")
    .delete()
    .eq("vehicle_id", vehicleId)
    .eq("kind", kind)
    .select("storage_path, public_url")
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;

  if (kind === "front") {
    const { error: coverError } = await supabase
      .from("vehicles")
      .update({ photo_url: null })
      .eq("id", vehicleId)
      .eq("photo_url", data.public_url);
    if (coverError) throw coverError;
  }

  await removeStoredVehiclePhoto(supabase, data.storage_path);
  return true;
}

/** Clear the listing cover, along with the front gallery photo it mirrors. */
export async function removeVehicleCover({
  supabase,
  vehicleId,
}: {
  supabase: SupabaseClient;
  vehicleId: string;
}) {
  await removeVehicleGalleryPhoto({ supabase, vehicleId, kind: "front" });

  const { data, error } = await supabase
    .from("vehicles")
    .update({ photo_url: null })
    .eq("id", vehicleId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The vehicle was not found.");
}

/** Take the car off the homepage hero by clearing its cut-out image. */
export async function removeVehicleShowcase({
  supabase,
  vehicleId,
}: {
  supabase: SupabaseClient;
  vehicleId: string;
}) {
  const { data: current, error: readError } = await supabase
    .from("vehicles")
    .select("showcase_image_url")
    .eq("id", vehicleId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("The vehicle was not found.");

  const { error } = await supabase
    .from("vehicles")
    .update({ showcase_image_url: null })
    .eq("id", vehicleId);
  if (error) throw error;

  await removeStoredVehiclePhoto(
    supabase,
    vehiclePhotoPathFromUrl(current.showcase_image_url),
  );
}
