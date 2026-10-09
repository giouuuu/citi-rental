import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";

/**
 * Phone videos run 50–200MB a minute; the free Supabase plan takes 50MB a
 * file and 1GB in total. Every video is re-encoded in the browser before it
 * is uploaded: H.264 MP4, long side at most 1280px, 30fps, ~1.2Mbps — about
 * 9MB a minute, and it plays everywhere.
 */
export const VIDEO_MAX_SECONDS = 90;
export const VIDEO_MAX_BYTES = 40 * 1024 * 1024;
const MAX_LONG_SIDE = 1280;
const VIDEO_BITRATE = 1_200_000;
const AUDIO_BITRATE = 64_000;

/** A failure worth showing the user as-is. */
export class VideoCompressionError extends Error {}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

export async function compressVideo(
  file: File,
  { onProgress }: { onProgress?: (progress: number) => void } = {},
): Promise<File> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    throw new VideoCompressionError(
      "This browser can't compress video. Use Chrome or Safari, or update your browser.",
    );
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) {
      throw new VideoCompressionError("Could not read that video. Try another file.");
    }

    const duration = await input.computeDuration();
    if (duration > VIDEO_MAX_SECONDS) {
      throw new VideoCompressionError(
        `Videos can be at most ${VIDEO_MAX_SECONDS} seconds. Trim this one (${Math.ceil(duration)}s) and add it again.`,
      );
    }

    const sourceWidth = await track.getDisplayWidth();
    const sourceHeight = await track.getDisplayHeight();
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(sourceWidth, sourceHeight));
    const width = even(sourceWidth * scale);
    const height = even(sourceHeight * scale);

    const canVideo = await canEncodeVideo("avc", {
      width,
      height,
      bitrate: VIDEO_BITRATE,
    });
    if (!canVideo) {
      throw new VideoCompressionError(
        "This device can't compress video. Try Chrome or Safari on another device.",
      );
    }
    const canAudio = await canEncodeAudio("aac", {
      numberOfChannels: 1,
      sampleRate: 48_000,
      bitrate: AUDIO_BITRATE,
    });

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: {
        width,
        height,
        fit: "contain",
        codec: "avc",
        quality: new Quality({ bitrate: VIDEO_BITRATE }),
        frameRate: 30,
        // Bake rotation into the frames so every player shows it upright.
        allowTransformationMetadata: false,
        forceTranscode: true,
      },
      // Without an AAC encoder (Firefox) the source audio is copied when it is
      // already AAC, and dropped otherwise — the picture is what matters.
      audio: canAudio
        ? {
            codec: "aac",
            numberOfChannels: 1,
            sampleRate: 48_000,
            quality: new Quality({ bitrate: AUDIO_BITRATE }),
            forceTranscode: true,
          }
        : { codec: "aac" },
      showWarnings: false,
    });

    if (
      !conversion.isValid ||
      conversion.discardedTracks.some((entry) => entry.track.isVideoTrack())
    ) {
      throw new VideoCompressionError(
        "This video's format isn't supported on this device. Try recording it again.",
      );
    }

    if (onProgress) conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) throw new VideoCompressionError("Could not compress that video.");
    if (buffer.byteLength > VIDEO_MAX_BYTES) {
      throw new VideoCompressionError(
        "That video is still too large after compressing. Record a shorter clip.",
      );
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([buffer], `${baseName}.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } finally {
    input.dispose();
  }
}
