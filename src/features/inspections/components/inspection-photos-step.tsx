"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OPTIONAL_OVERVIEW_PHOTO_KINDS,
  REQUIRED_OVERVIEW_PHOTO_KINDS,
  isDamageStatus,
} from "@/features/inspections/lib/checklist-areas";
import type { ChecklistDraftItem } from "@/features/inspections/components/inspection-checklist-panel";
import type { RentalInspection } from "@/features/inspections/types/inspection";

export function InspectionPhotosStep({
  items,
  overviewFiles,
  damageFiles,
  referenceInspection = null,
  onOverview,
  onDamage,
  onContinue,
}: {
  items: ChecklistDraftItem[];
  overviewFiles: Record<string, File | null>;
  damageFiles: Record<string, File | null>;
  referenceInspection?: RentalInspection | null;
  onOverview: (kind: string, file: File | null) => void;
  onDamage: (areaCode: string, file: File | null) => void;
  onContinue: () => void;
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

  const missingRequired = REQUIRED_OVERVIEW_PHOTO_KINDS.filter(
    (kind) => !overviewFiles[kind.value],
  );
  const missingDamage = damaged.filter((item) => !damageFiles[item.areaCode]);
  const canContinue =
    missingRequired.length === 0 && missingDamage.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Required angles</h3>
        <p className="text-xs text-muted-foreground">
          Capture front, rear, both sides, interior, and dashboard on every
          inspection.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        {REQUIRED_OVERVIEW_PHOTO_KINDS.map((kind) => {
          const pickup = pickupByKind.get(kind.value);
          return (
            <div key={kind.value} className="space-y-1.5">
              <Label htmlFor={kind.value}>
                {kind.label} *
                {overviewFiles[kind.value] ? " ✓" : ""}
              </Label>
              {pickup?.signedUrl ? (
                <div className="relative mb-1 aspect-video overflow-hidden rounded-md border bg-muted">
                  <Image
                    alt={`Pickup ${kind.label}`}
                    className="object-cover"
                    fill
                    sizes="240px"
                    src={pickup.signedUrl}
                    unoptimized
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    Pickup reference
                  </span>
                </div>
              ) : null}
              <Input
                accept="image/*"
                capture="environment"
                id={kind.value}
                type="file"
                onChange={(event) =>
                  onOverview(kind.value, event.target.files?.[0] ?? null)
                }
              />
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Optional readings photos</h3>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
          {OPTIONAL_OVERVIEW_PHOTO_KINDS.map((kind) => (
            <div key={kind.value} className="space-y-1.5">
              <Label htmlFor={kind.value}>
                {kind.label}
                {overviewFiles[kind.value] ? " ✓" : ""}
              </Label>
              <Input
                accept="image/*"
                capture="environment"
                id={kind.value}
                type="file"
                onChange={(event) =>
                  onOverview(kind.value, event.target.files?.[0] ?? null)
                }
              />
            </div>
          ))}
        </div>
      </div>

      {damaged.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Damage close-ups (required)</h3>
          {damaged.map((item) => {
            const prior = pickupDamageByArea.get(item.areaCode);
            return (
              <div key={item.areaCode} className="space-y-1.5">
                <Label htmlFor={`damage-${item.areaCode}`}>
                  {item.label} *
                  {damageFiles[item.areaCode] ? " ✓" : ""}
                </Label>
                {prior?.signedUrl ? (
                  <div className="relative mb-1 aspect-video max-w-xs overflow-hidden rounded-md border bg-muted">
                    <Image
                      alt={`Pickup ${item.label}`}
                      className="object-cover"
                      fill
                      sizes="240px"
                      src={prior.signedUrl}
                      unoptimized
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      Pickup close-up
                    </span>
                  </div>
                ) : null}
                <Input
                  accept="image/*"
                  capture="environment"
                  id={`damage-${item.areaCode}`}
                  type="file"
                  onChange={(event) =>
                    onDamage(item.areaCode, event.target.files?.[0] ?? null)
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <Button disabled={!canContinue} type="button" onClick={onContinue}>
        {canContinue
          ? "Continue to sign-off"
          : `Add ${[
              ...missingRequired.map((kind) => kind.label),
              ...missingDamage.map((item) => item.label),
            ]
              .slice(0, 3)
              .join(", ")}${
              missingRequired.length + missingDamage.length > 3 ? "…" : ""
            }`}
      </Button>
    </div>
  );
}
