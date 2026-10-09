import { INSPECTION_PHOTOS_BUCKET } from "@/features/inspections/lib/inspection-media";
import { createClient } from "@/lib/supabase/client";

function extensionFor(file: File) {
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

/**
 * Upload one already-compressed photo or video straight to storage from the
 * browser. Server Actions cap a request at 6MB, which a single video — or a
 * dozen photos — would exceed. Storage RLS limits inserts to staff.
 */
export async function uploadInspectionMedia({
  rentalId,
  file,
  kind,
}: {
  rentalId: string;
  file: File;
  kind: string;
}): Promise<string> {
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "media";
  const path = `${rentalId}/${safeKind}-${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await createClient()
    .storage.from(INSPECTION_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    throw new Error(
      `Could not upload ${file.name}. Check your connection and try again.`,
    );
  }
  return path;
}

/** Run `task` over `items`, at most `limit` at a time, keeping order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
