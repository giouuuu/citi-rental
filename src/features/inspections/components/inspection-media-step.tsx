"use client";

import { useState } from "react";
import Image from "next/image";
import {
  AlertCircleIcon,
  CheckIcon,
  CloudUploadIcon,
  PlayIcon,
  RotateCwIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { ChecklistDraftItem } from "@/features/inspections/components/inspection-checklist-panel";
import { InspectionMediaGrid } from "@/features/inspections/components/inspection-media-grid";
import type { MediaDraft } from "@/features/inspections/hooks/use-inspection-media";
import { isDamageStatus } from "@/features/inspections/lib/checklist-areas";
import {
  MAX_GALLERY_ITEMS,
  MIN_INSPECTION_PHOTOS,
  galleryMedia,
} from "@/features/inspections/lib/inspection-media";
import type { RentalInspection } from "@/features/inspections/types/inspection";
import { ImageDropzone } from "@/features/shared/components/image-dropzone";
import { compressImage } from "@/features/shared/lib/compress-image";
import { VIDEO_MAX_SECONDS } from "@/features/shared/lib/compress-video";
import { fillSlotsFrom } from "@/features/shared/lib/file-accept";
import { cn } from "@/lib/utils";

/** Everything still missing before the media step can be left. */
export function missingInspectionMedia({
  items,
  media,
  damageFiles,
}: {
  items: ChecklistDraftItem[];
  media: MediaDraft[];
  damageFiles: Record<string, File | null>;
}) {
  const ready = media.filter((entry) => entry.status === "ready");
  const readyPhotoCount = ready.filter((entry) => entry.type === "image").length;
  const compressingCount = media.filter(
    (entry) => entry.status === "compressing",
  ).length;
  const missingDamage = items.filter(
    (item) => isDamageStatus(item.status) && !damageFiles[item.areaCode],
  );
  return {
    readyCount: ready.length,
    readyPhotoCount,
    compressingCount,
    missingDamage,
  };
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Where a compressed file is on its way to storage. */
function UploadBadge({
  draft,
  onRetry,
}: {
  draft: MediaDraft;
  onRetry?: () => void;
}) {
  if (draft.status !== "ready") return null;
  if (draft.upload === "failed") {
    return (
      <Button
        className="absolute right-1 bottom-1 h-6 gap-1 px-1.5 text-[10px]"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="destructive"
      >
        <RotateCwIcon className="size-3" />
        Retry
      </Button>
    );
  }
  return (
    <span
      className={cn(
        "absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full text-white",
        draft.upload === "uploaded" ? "bg-primary" : "bg-black/60",
      )}
      title={draft.upload === "uploaded" ? "Uploaded" : "Uploading…"}
    >
      {draft.upload === "uploaded" ? (
        <CheckIcon className="size-3" />
      ) : (
        <CloudUploadIcon className="size-3" />
      )}
      <span className="sr-only">
        {draft.upload === "uploaded" ? "Uploaded" : "Uploading"}
      </span>
    </span>
  );
}

export function MediaDraftTile({
  draft,
  onRemove,
  onRetry,
}: {
  draft: MediaDraft;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  return (
    <li className="relative aspect-square overflow-hidden rounded-md border bg-muted">
      {draft.status === "ready" && draft.previewUrl ? (
        draft.type === "video" ? (
          <>
            <video
              className="size-full object-cover"
              muted
              playsInline
              preload="metadata"
              src={`${draft.previewUrl}#t=0.1`}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                <PlayIcon className="size-4 translate-x-px fill-current" />
              </span>
            </span>
          </>
        ) : (
          <Image
            alt={draft.name}
            className="object-cover"
            fill
            sizes="160px"
            src={draft.previewUrl}
            unoptimized
          />
        )
      ) : null}

      {draft.status === "compressing" ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="w-full truncate text-xs font-medium">{draft.name}</p>
          <Progress
            aria-label={`Compressing ${draft.name}`}
            value={draft.type === "video" ? Math.round(draft.progress * 100) : null}
          />
          <p className="text-[11px] text-muted-foreground">
            {draft.type === "video"
              ? draft.progress > 0
                ? `Compressing ${Math.round(draft.progress * 100)}%`
                : "Waiting to compress…"
              : "Optimizing…"}
          </p>
        </div>
      ) : null}

      {draft.status === "error" ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center">
          <AlertCircleIcon className="size-5 text-destructive" />
          <p className="text-[11px] leading-snug text-destructive">{draft.error}</p>
        </div>
      ) : null}

      {draft.status === "ready" && draft.file ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
          {formatBytes(draft.file.size)}
        </span>
      ) : null}

      <UploadBadge draft={draft} onRetry={onRetry} />

      <Button
        aria-label={`Remove ${draft.name}`}
        className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm"
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}

function DamageSlot({
  id,
  label,
  file,
  referenceUrl,
  onFiles,
}: {
  id: string;
  label: string;
  file: File | null;
  referenceUrl?: string | null;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-card p-3 transition-colors",
        file && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="min-w-0 truncate" htmlFor={id}>
          {label}
          <span className="text-destructive"> *</span>
        </Label>
        {file ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
            <CheckIcon className="size-3.5" />
            Added
          </span>
        ) : null}
      </div>

      {referenceUrl ? (
        <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
          <Image
            alt={`${label} at release`}
            className="object-cover"
            fill
            sizes="240px"
            src={referenceUrl}
            unoptimized
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            Release close-up
          </span>
        </div>
      ) : null}

      <ImageDropzone
        accept="image/*"
        capture="environment"
        id={id}
        multiple
        prepare={compressImage}
        value={file}
        onFiles={onFiles}
      />
    </div>
  );
}

export function InspectionMediaStep({
  items,
  media,
  limitNotice,
  damageFiles,
  referenceInspection = null,
  onAddMedia,
  onRemoveMedia,
  onRetryMedia,
  onDamage,
}: {
  items: ChecklistDraftItem[];
  media: MediaDraft[];
  limitNotice: string | null;
  damageFiles: Record<string, File | null>;
  referenceInspection?: RentalInspection | null;
  onAddMedia: (files: File[]) => void;
  onRemoveMedia: (id: string) => void;
  onRetryMedia: (id: string) => void;
  onDamage: (areaCode: string, file: File | null) => void;
}) {
  const damaged = items.filter((item) => isDamageStatus(item.status));
  const damagedAreas = damaged.map((item) => item.areaCode);
  const releaseMedia = galleryMedia(referenceInspection?.photos ?? []);

  const itemIdToArea = new Map(
    (referenceInspection?.items ?? []).map((item) => [item.id, item.areaCode]),
  );
  const releaseDamageByArea = new Map<string, string>();
  for (const photo of referenceInspection?.photos ?? []) {
    if (photo.kind !== "damage_closeup" || !photo.signedUrl || !photo.itemId) {
      continue;
    }
    const areaCode = itemIdToArea.get(photo.itemId);
    if (areaCode) releaseDamageByArea.set(areaCode, photo.signedUrl);
  }

  function placeDamageFiles(start: string, files: File[]) {
    if (files.length === 0) {
      onDamage(start, null);
      return;
    }
    const next = fillSlotsFrom({
      slots: damagedAreas,
      start,
      files,
      current: damageFiles,
    });
    for (const slot of damagedAreas) {
      if (next[slot] !== damageFiles[slot]) onDamage(slot, next[slot] ?? null);
    }
  }

  const readyCount = media.filter((entry) => entry.status === "ready").length;
  const readyPhotoCount = media.filter(
    (entry) => entry.status === "ready" && entry.type === "image",
  ).length;
  const full = media.length >= MAX_GALLERY_ITEMS;
  // Remount the zone after each pick so the same file can be picked again.
  const [pickKey, setPickKey] = useState(0);

  return (
    <div className="space-y-6">
      {referenceInspection ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">At release</h3>
          <InspectionMediaGrid
            className="@md:grid-cols-6 @3xl:grid-cols-8"
            emptyLabel="No photos or videos were saved at release."
            media={releaseMedia}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Photos &amp; videos<span className="text-destructive"> *</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              At least {MIN_INSPECTION_PHOTOS} photos of the car. Videos and
              more photos are optional — they upload in the background, and one
              that fails won&apos;t hold up the inspection.
            </p>
          </div>
          <span
            aria-live="polite"
            className="text-xs font-medium text-muted-foreground tabular-nums"
          >
            {readyCount} added
            {readyPhotoCount < MIN_INSPECTION_PHOTOS
              ? ` · ${MIN_INSPECTION_PHOTOS - readyPhotoCount} more photo${MIN_INSPECTION_PHOTOS - readyPhotoCount === 1 ? "" : "s"} needed`
              : ""}
          </span>
        </header>

        <ImageDropzone
          key={pickKey}
          accept="image/*,video/*"
          disabled={full}
          hint={`Videos up to ${VIDEO_MAX_SECONDS} seconds. Everything is compressed on this device before it uploads.`}
          id="inspection-media"
          multiple
          noun="photos or videos"
          value={null}
          onFiles={(files) => {
            if (files.length === 0) return;
            onAddMedia(files);
            setPickKey((key) => key + 1);
          }}
        />
        {limitNotice ? (
          <p aria-live="polite" className="text-xs text-destructive">
            {limitNotice}
          </p>
        ) : null}

        {media.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-4">
            {media.map((draft) => (
              <MediaDraftTile
                key={draft.id}
                draft={draft}
                onRemove={() => onRemoveMedia(draft.id)}
                onRetry={() => onRetryMedia(draft.id)}
              />
            ))}
          </ul>
        ) : null}
      </section>

      {damaged.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Damage close-ups</h3>
            <p className="text-xs text-muted-foreground">
              One photo per panel flagged on the condition step.
            </p>
          </div>
          <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
            {damaged.map((item) => (
              <DamageSlot
                key={item.areaCode}
                file={damageFiles[item.areaCode] ?? null}
                id={`damage-${item.areaCode}`}
                label={item.label}
                referenceUrl={releaseDamageByArea.get(item.areaCode)}
                onFiles={(files) => placeDamageFiles(item.areaCode, files)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
