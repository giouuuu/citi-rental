import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYMENT_PROOFS_BUCKET = "payment-proofs";
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

export async function uploadPaymentProof(options: {
  supabase: SupabaseClient;
  organizationId: string;
  rentalId: string;
  file: File;
}): Promise<string> {
  const { supabase, organizationId, rentalId, file } = options;

  if (!file.size) {
    throw new Error("Choose a payment screenshot to upload.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Payment screenshots must be 5MB or smaller.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }

  const path = `${organizationId}/${rentalId}/proof-${Date.now()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;

  return path;
}
