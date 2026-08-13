"use client";

import Image from "next/image";
import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OPTIONAL_OVERVIEW_PHOTO_KINDS,
  REQUIRED_OVERVIEW_PHOTO_KINDS,
  isDamageStatus,
} from "@/features/inspections/lib/checklist-areas";
import type { ChecklistDraftItem } from "@/features/inspections/components/inspection-checklist-panel";
import type { RentalInspection } from "@/features/inspections/types/inspection";
import { cn } from "@/lib/utils";

/** Everything still missing before the photos step can be left. */
export function missingInspectionPhotos({
  items,
  overviewFiles,
  damageFiles,
}: {
  items: ChecklistDraftItem[];
  overviewFiles: Record<string, File | null>;
  damageFiles: Record<string, File | null>;
}) {
  const missingRequired = REQUIRED_OVERVIEW_PHOTO_KINDS.filter(
    (kind) => !overviewFiles[kind.value],
  );
  const missingDamage = items.filter(
    (item) => isDamageStatus(item.status) && !damageFiles[item.areaCode],
  );
  return { missingRequired, missingDamage };
}

function PhotoSlot({
  id,
  label,
  required = false,
  file,
  referenceUrl,
  referenceLabel,
  onFile,
}: {
  id: string;
  label: string;
  required?: boolean;
  file: File | null;
  referenceUrl?: string | null;
  referenceLabel?: string;
  onFile: (file: File | null) => void;
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
          {required ? <span className="text-destructive"> *</span> : null}
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
            alt={referenceLabel ?? "Reference photo"}
            className="object-cover"
            fill
            sizes="240px"
            src={referenceUrl}
            unoptimized
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {referenceLabel ?? "Pickup reference"}
          </span>
        </div>
      ) : null}

      <Input
        accept="image/*"
        capture="environment"
        id={id}
        type="file"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export function InspectionPhotosStep({
  items,
  overviewFiles,
  damageFiles,
  referenceInspection = null,
  onOverview,
  onDamage,
}: {
  items: ChecklistDraftItem[];
  overviewFiles: Record<string, File | null>;
  damageFiles: Record<string, File | null>;
  referenceInspection?: RentalInspection | null;
  onOverview: (kind: string, file: File | null) => void;
  onDamage: (areaCode: string, file: File | null) => void;
}) {
  const damaged = items.filter((item) => isDamageStatus(item.status));
  const pickupPhotos = referenceInspection?.photos ?? [];
  const pickupByKind = new Map(
    pickupPhotos
      .filter((photo) => photo.signedUrl)
      .map((photo) => [photo.kind, photo]),
  );
  const itemIdToArea = new Map(
    (referenceInspection?.items ?? []).map((item) => [item.id, item.areaCode]),
  );
  const pickupDamageByArea = new Map<string, (typeof pickupPhotos)[number]>();
  for (const photo of pickupPhotos) {
    if (photo.kind !== "damage_closeup" || !photo.signedUrl || !photo.itemId) {
      continue;
    }
    const areaCode = itemIdToArea.get(photo.itemId);
    if (areaCode) pickupDamageByArea.set(areaCode, photo);
  }

  const capturedRequired = REQUIRED_OVERVIEW_PHOTO_KINDS.filter(
    (kind) => overviewFiles[kind.value],
  ).length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Required angles</h3>
            <p className="text-xs text-muted-foreground">
              Front, rear, both sides, interior, and dashboard.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {capturedRequired} / {REQUIRED_OVERVIEW_PHOTO_KINDS.length} captured
          </span>
        </header>
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
          {REQUIRED_OVERVIEW_PHOTO_KINDS.map((kind) => (
            <PhotoSlot
              key={kind.value}
              file={overviewFiles[kind.value] ?? null}
              id={kind.value}
              label={kind.label}
              referenceLabel="Pickup reference"
              referenceUrl={pickupByKind.get(kind.value)?.signedUrl}
              required
              onFile={(file) => onOverview(kind.value, file)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Optional readings photos</h3>
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
          {OPTIONAL_OVERVIEW_PHOTO_KINDS.map((kind) => (
            <PhotoSlot
              key={kind.value}
              file={overviewFiles[kind.value] ?? null}
              id={kind.value}
              label={kind.label}
              onFile={(file) => onOverview(kind.value, file)}
            />
          ))}
        </div>
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
              <PhotoSlot
                key={item.areaCode}
                file={damageFiles[item.areaCode] ?? null}
                id={`damage-${item.areaCode}`}
                label={item.label}
                referenceLabel="Pickup close-up"
                referenceUrl={pickupDamageByArea.get(item.areaCode)?.signedUrl}
                required
                onFile={(file) => onDamage(item.areaCode, file)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
