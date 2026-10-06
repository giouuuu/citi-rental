import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const BOOKING_IDS_BUCKET = "booking-ids";
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type BookingIdPhotos = {
  licenseSelfie: File;
  governmentId: File;
};

function checkPhoto(file: File, label: string) {
  if (!file.size) throw new Error(`Choose a ${label} photo to upload.`);
  if (file.size > MAX_BYTES) {
    throw new Error(`The ${label} photo must be 5MB or smaller.`);
  }
  if (!EXTENSIONS[file.type]) {
    throw new Error(`Use a JPEG, PNG, or WebP photo for the ${label}.`);
  }
}

/**
 * Uploads both renter ID photos into one fresh `<uuid>/` folder. Paths are
 * fixed (`license-selfie.*`, `government-id.*`) because the storage policy and
 * create_public_booking only accept that shape.
 */
export async function uploadBookingIdPhotos(options: {
  supabase: SupabaseClient;
  photos: BookingIdPhotos;
}): Promise<{ licenseSelfiePath: string; governmentIdPath: string }> {
  const { supabase, photos } = options;
  checkPhoto(photos.licenseSelfie, "license selfie");
  checkPhoto(photos.governmentId, "government ID");

  const folder = crypto.randomUUID();
  const uploads = [
    ["license-selfie", photos.licenseSelfie],
    ["government-id", photos.governmentId],
  ] as const;

  const [licenseSelfiePath, governmentIdPath] = await Promise.all(
    uploads.map(async ([name, file]) => {
      const path = `${folder}/${name}.${EXTENSIONS[file.type]}`;
      const { error } = await supabase.storage
        .from(BOOKING_IDS_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
      if (error) {
        throw new Error("We could not upload your ID photos. Please try again.");
      }
      return path;
    }),
  );

  return { licenseSelfiePath, governmentIdPath };
}
