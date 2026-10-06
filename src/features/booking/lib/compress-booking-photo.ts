import imageCompression from "browser-image-compression";

/** Two photos ride one Server Action; keep each well under half the 6MB body limit. */
const TARGET_MAX_MB = 0.8;
const MAX_DIMENSION = 1920;
const UPLOADABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Re-encodes an ID photo as JPEG when it is large or in a format the bucket
 * refuses (e.g. HEIC from an iPhone camera). Small JPEG/PNG/WebP pass through.
 */
export async function compressBookingPhoto(file: File): Promise<File> {
  if (UPLOADABLE.has(file.type) && file.size <= TARGET_MAX_MB * 1024 * 1024) {
    return file;
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: TARGET_MAX_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.85,
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "id-photo";
  return new File([compressed], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
