import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const REVIEW_PHOTOS_BUCKET = "review-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadReviewPhoto(
  supabase: SupabaseClient,
  reviewId: string,
  file: File,
): Promise<string> {
  const extension = EXTENSIONS[file.type];
  if (!extension) throw new Error("Use a JPEG, PNG, or WebP photo.");
  if (file.size > MAX_BYTES) throw new Error("Review photos must be 5MB or smaller.");

  const path = `${reviewId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(REVIEW_PHOTOS_BUCKET)
    .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
  if (error) throw error;

  return supabase.storage.from(REVIEW_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Best-effort delete of an uploaded photo the row no longer points at. Starter
 * photos served from `/reviews/` are not in storage and are left alone.
 */
export async function removeReviewPhoto(supabase: SupabaseClient, url: string | null) {
  const marker = `/object/public/${REVIEW_PHOTOS_BUCKET}/`;
  const index = url?.indexOf(marker) ?? -1;
  if (!url || index === -1) return;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  await supabase.storage.from(REVIEW_PHOTOS_BUCKET).remove([path]);
}
