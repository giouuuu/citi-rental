"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_GALLERY_ITEMS } from "@/features/inspections/lib/inspection-media";
import { compressImage } from "@/features/shared/lib/compress-image";
import {
  VideoCompressionError,
  compressVideo,
} from "@/features/shared/lib/compress-video";

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
};

function isVideoFile(file: File) {
  return (
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name)
  );
}

/**
 * The inspection's free photo/video gallery. Every file is compressed as soon
 * as it is added — photos to ~0.8MB, videos to a 720p MP4 — one at a time,
 * so a phone is not asked to encode three videos at once. Nothing reaches
 * storage until the inspection is submitted.
 */
export function useInspectionMedia() {
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  const removed = useRef(new Set<string>());
  const urls = useRef(new Set<string>());

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
        patch(id, { status: "ready", progress: 1, file, previewUrl });
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
    [patch],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const room = Math.max(0, MAX_GALLERY_ITEMS - media.length);
      const accepted = files.slice(0, room);
      setLimitNotice(
        accepted.length < files.length
          ? `An inspection holds up to ${MAX_GALLERY_ITEMS} photos and videos. ${files.length - accepted.length} skipped.`
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
        }),
      );
      setMedia((prev) => [...prev, ...drafts]);
      drafts.forEach((draft, index) => {
        queue.current = queue.current.then(() =>
          compress(draft.id, accepted[index]!, draft.type),
        );
      });
    },
    [compress, media.length],
  );

  const remove = useCallback(
    (id: string) => {
      removed.current.add(id);
      const previewUrl = media.find((item) => item.id === id)?.previewUrl;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        urls.current.delete(previewUrl);
      }
      setMedia((prev) => prev.filter((item) => item.id !== id));
    },
    [media],
  );

  const ready = media.filter((entry) => entry.status === "ready" && entry.file);
  const compressing = media.filter((entry) => entry.status === "compressing");

  return {
    media,
    ready,
    compressingCount: compressing.length,
    limitNotice,
    addFiles,
    remove,
  };
}
