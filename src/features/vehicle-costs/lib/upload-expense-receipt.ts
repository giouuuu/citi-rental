import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
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

/** Upload a receipt image to the private bucket; returns the object path. */
export async function uploadExpenseReceipt(options: {
  supabase: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  file: File;
}): Promise<string> {
  const { supabase, organizationId, vehicleId, file } = options;

  if (!file.size) throw new Error("Choose a receipt photo to upload.");
  if (file.size > MAX_BYTES)
    throw new Error("Receipt photos must be 5MB or smaller.");
  if (!ALLOWED_TYPES.has(file.type))
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");

  const path = `${organizationId}/${vehicleId}/receipt-${Date.now()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;
  return path;
}
