"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INSPECTION_PHOTOS_BUCKET,
  MAX_GALLERY_ITEMS,
} from "@/features/inspections/lib/inspection-media";
import { uploadInspectionMedia } from "@/features/inspections/lib/upload-inspection-media";
import { compressImage } from "@/features/shared/lib/compress-image";
import {
  VideoCompressionError,
  compressVideo,
} from "@/features/shared/lib/compress-video";
import { createClient } from "@/lib/supabase/client";

export type MediaDraft = {
  id: string;
  type: "image" | "video";
  name: string;
  status: "compressing" | "ready" | "error";
  /** 0–1 while a video compresses. */
  progress: number;
  /** The compressed file — only this is ever uploaded. */
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  /** Storage upload, started as soon as the file is compressed. */
  upload: "idle" | "uploading" | "uploaded" | "failed";
};

/** A gallery file that reached storage. */
export type UploadedMedia = { id: string; type: MediaDraft["type"]; path: string };

function isVideoFile(file: File) {
  return (
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name)
  );
}

/**
 * The inspection's free photo/video gallery. Every file is compressed as soon
 * as it is added — photos to ~0.8MB, videos to a 720p MP4 — one at a time,
 * so a phone is not asked to encode three videos at once. Each compressed
 * file then uploads in the background, so most of the gallery is already in
 * storage by the time the inspection is submitted, and a slow or failed
 * video never holds up the rest.
 */
export function useInspectionMedia({
  rentalId,
  maxItems = MAX_GALLERY_ITEMS,
}: {
  rentalId: string;
  /** Room left in the inspection's gallery. */
  maxItems?: number;
}) {
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  const removed = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  // Refs, not state, so an awaiting submit reads the live upload results.
  const files = useRef(new Map<string, { file: File; type: MediaDraft["type"] }>());
  const uploads = useRef(new Map<string, Promise<string | null>>());
  const paths = useRef(new Map<string, string>());

  useEffect(() => {
    const owned = urls.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<MediaDraft>) => {
    setMedia((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
    );
  }, []);

  const startUpload = useCallback(
    (id: string): Promise<string | null> => {
      const entry = files.current.get(id);
      if (!entry || removed.current.has(id)) return Promise.resolve(null);
      const existing = paths.current.get(id);
      if (existing) return Promise.resolve(existing);

      patch(id, { upload: "uploading" });
      const run = uploadInspectionMedia({ rentalId, file: entry.file, kind: "other" })
        .then((path) => {
          if (removed.current.has(id)) {
            void createClient().storage.from(INSPECTION_PHOTOS_BUCKET).remove([path]);
            return null;
          }
          paths.current.set(id, path);
          patch(id, { upload: "uploaded" });
          return path;
        })
        .catch(() => {
          patch(id, { upload: "failed" });
          return null;
        })
        .finally(() => uploads.current.delete(id));
      uploads.current.set(id, run);
      return run;
    },
    [patch, rentalId],
  );

  const compress = useCallback(
    async (id: string, source: File, type: MediaDraft["type"]) => {
      if (removed.current.has(id)) return;
      try {
        const file =
          type === "video"
            ? await compressVideo(source, {
                onProgress: (progress) => patch(id, { progress }),
              })
            : await compressImage(source);
        if (removed.current.has(id)) return;
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        files.current.set(id, { file, type });
        patch(id, { status: "ready", progress: 1, file, previewUrl });
        void startUpload(id);
      } catch (error) {
        patch(id, {
          status: "error",
          error:
            error instanceof VideoCompressionError
              ? error.message
              : type === "video"
                ? "Could not compress that video. Try another clip."
                : "Could not read that photo. Try another one.",
        });
      }
    },
    [patch, startUpload],
  );

  const addFiles = useCallback(
    (picked: File[]) => {
      const room = Math.max(0, maxItems - media.length);
      const accepted = picked.slice(0, room);
      setLimitNotice(
        accepted.length < picked.length
          ? `An inspection holds up to ${MAX_GALLERY_ITEMS} photos and videos. ${picked.length - accepted.length} skipped.`
          : null,
      );
      if (accepted.length === 0) return;

      const drafts = accepted.map(
        (file): MediaDraft => ({
          id: crypto.randomUUID(),
          type: isVideoFile(file) ? "video" : "image",
          name: file.name,
          status: "compressing",
          progress: 0,
          file: null,
          previewUrl: null,
          error: null,
          upload: "idle",
        }),
      );
      setMedia((prev) => [...prev, ...drafts]);
      drafts.forEach((draft, index) => {
        queue.current = queue.current.then(() =>
          compress(draft.id, accepted[index]!, draft.type),
        );
      });
    },
    [compress, maxItems, media.length],
  );

  const remove = useCallback(
    (id: string) => {
      removed.current.add(id);
      const previewUrl = media.find((item) => item.id === id)?.previewUrl;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        urls.current.delete(previewUrl);
      }
      const path = paths.current.get(id);
      if (path) {
        // Best effort: it is not attached to anything yet.
        void createClient().storage.from(INSPECTION_PHOTOS_BUCKET).remove([path]);
        paths.current.delete(id);
      }
      files.current.delete(id);
      setMedia((prev) => prev.filter((item) => item.id !== id));
    },
    [media],
  );

  /** Everything that reached storage, in the order it was added. */
  const uploaded = useCallback(
    (): UploadedMedia[] =>
      [...files.current.entries()].flatMap(([id, entry]) => {
        const path = paths.current.get(id);
        return path && !removed.current.has(id)
          ? [{ id, type: entry.type, path }]
          : [];
      }),
    [],
  );

  /**
   * Wait for every compressed file to finish uploading, retrying the ones
   * that failed once. Files still compressing are not waited for.
   */
  const settle = useCallback(async (): Promise<UploadedMedia[]> => {
    await Promise.all(
      [...files.current.keys()].map(
        (id) => uploads.current.get(id) ?? startUpload(id),
      ),
    );
    return uploaded();
  }, [startUpload, uploaded]);

  /** Forget the files once they are saved on an inspection. */
  const reset = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    for (const id of files.current.keys()) removed.current.add(id);
    files.current.clear();
    paths.current.clear();
    setMedia([]);
    setLimitNotice(null);
  }, []);

  const ready = media.filter((entry) => entry.status === "ready" && entry.file);
  const compressing = media.filter((entry) => entry.status === "compressing");

  return {
    media,
    ready,
    readyPhotoCount: ready.filter((entry) => entry.type === "image").length,
    uploadedPhotoCount: media.filter(
      (entry) => entry.type === "image" && entry.upload === "uploaded",
    ).length,
    compressingCount: compressing.length,
    limitNotice,
    addFiles,
    remove,
    retry: startUpload,
    uploaded,
    settle,
    reset,
  };
}
