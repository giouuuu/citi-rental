import imageCompression from "browser-image-compression";

/**
 * Server Actions cap a request at 6MB (`next.config.ts`), and storage buckets
 * at 5MB a file. Phone photos are often bigger than both, so every image is
 * shrunk in the browser before it is sent.
 */
const TARGET_MAX_MB = 0.8;
const MAX_DIMENSION = 1920;
const PASS_THROUGH = new Set(["image/jpeg", "image/png", "image/webp"]);
const TRANSPARENT = new Set(["image/png", "image/webp"]);

/**
 * Re-encode an image so it fits the upload limits. Small JPEG/PNG/WebP pass
 * through untouched; anything large or in a format the buckets refuse (HEIC
 * from an iPhone, GIF) becomes a JPEG of at most 1920px and ~0.8MB.
 *
 * `keepTransparency` keeps PNG/WebP in their own format — for cut-out images
 * such as the landing-page car, where a JPEG would paint the background.
 */
export async function compressImage(
  file: File,
  { keepTransparency = false }: { keepTransparency?: boolean } = {},
): Promise<File> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }
  if (PASS_THROUGH.has(file.type) && file.size <= TARGET_MAX_MB * 1024 * 1024) {
    return file;
  }

  const keepFormat = keepTransparency && TRANSPARENT.has(file.type);
  const type = keepFormat ? file.type : "image/jpeg";
  const compressed = await imageCompression(file, {
    maxSizeMB: TARGET_MAX_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    fileType: type,
    initialQuality: 0.85,
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return new File([compressed], `${baseName}.${extension}`, {
    type,
    lastModified: Date.now(),
  });
}
