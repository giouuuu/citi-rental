import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const INSPECTION_PHOTOS_BUCKET = "rental-inspection-photos";
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

export async function uploadInspectionPhoto(options: {
  supabase: SupabaseClient;
  organizationId: string;
  rentalId: string;
  file: File;
  kind: string;
}): Promise<string> {
  const { supabase, organizationId, rentalId, file, kind } = options;

  if (!file.size) throw new Error("Choose a photo to upload.");
  if (file.size > MAX_BYTES) {
    throw new Error("Inspection photos must be 5MB or smaller.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }

  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "photo";
  const path = `${organizationId}/${rentalId}/${safeKind}-${Date.now()}.${extensionFor(file)}`;

  const { error } = await supabase.storage
    .from(INSPECTION_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function uploadInspectionPhotoFromDataUrl(options: {
  supabase: SupabaseClient;
  organizationId: string;
  rentalId: string;
  dataUrl: string;
  kind: string;
}): Promise<string> {
  const { dataUrl, ...rest } = options;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid signature image.");

  const mime = match[1]!;
  const binary = Buffer.from(match[2]!, "base64");
  const file = new File([binary], `signature.${mime.includes("png") ? "png" : "jpg"}`, {
    type: mime,
  });

  return uploadInspectionPhoto({ ...rest, file, kind: options.kind });
}

export async function createInspectionSignedUrls(
  supabase: SupabaseClient,
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(INSPECTION_PHOTOS_BUCKET)
    .createSignedUrls(unique, expiresIn);
  if (error) throw error;

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      map.set(entry.path, entry.signedUrl);
    }
  }
  return map;
}
