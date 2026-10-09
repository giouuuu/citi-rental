import type { InspectionPhoto } from "@/features/inspections/types/inspection";

/** Holds photos and (since the media gallery) MP4 videos. */
export const INSPECTION_PHOTOS_BUCKET = "rental-inspection-photos";

/** Gallery photos and videos per inspection, on top of damage close-ups. */
export const MAX_GALLERY_ITEMS = 40;

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);
const MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "mp4"]);

function extensionOf(path: string) {
  return path.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
}

export function isVideoPath(path: string) {
  return VIDEO_EXTENSIONS.has(extensionOf(path));
}

/**
 * The free gallery of an inspection: everything except the signature and the
 * per-panel damage close-ups. Older inspections' fixed angles (front, rear…)
 * land here too.
 */
export function galleryMedia(photos: InspectionPhoto[]) {
  return photos.filter(
    (photo) => photo.kind !== "signature" && photo.kind !== "damage_closeup",
  );
}

/**
 * Media is uploaded from the browser, so the server only trusts paths inside
 * this rental's folder with an extension the bucket accepts.
 */
export function isInspectionMediaPath(path: string, rentalId: string) {
  const prefix = `${rentalId}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[a-z0-9_-]+\.[a-z0-9]+$/i.test(name) && MEDIA_EXTENSIONS.has(extensionOf(name));
}
