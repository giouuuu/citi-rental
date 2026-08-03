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
  organizationId: string;
  vehicleId: string;
  file: File;
  kind?: VehiclePhotoKind | "cover";
}): Promise<{ path: string; publicUrl: string }> {
  const { supabase, organizationId, vehicleId, file, kind = "cover" } = options;

  if (!file.size) {
    throw new Error("Choose a vehicle photo to upload.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Vehicle photos must be 5MB or smaller.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }

  const path = `${organizationId}/${vehicleId}/${kind}-${Date.now()}.${extensionFor(file)}`;
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
