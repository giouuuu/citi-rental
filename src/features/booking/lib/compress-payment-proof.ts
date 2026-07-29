import imageCompression from "browser-image-compression";

/** Keep under Next.js default Server Action body limit (1 MB). */
const TARGET_MAX_MB = 0.8;
const MAX_DIMENSION = 1920;

export async function compressPaymentProof(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }

  // Already small enough for the Server Action payload.
  if (file.size <= TARGET_MAX_MB * 1024 * 1024) {
    return file;
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: TARGET_MAX_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    // Screenshots compress best as JPEG; GIF animation is not needed for proofs.
    fileType: "image/jpeg",
    initialQuality: 0.8,
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "payment-proof";
  return new File([compressed], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
