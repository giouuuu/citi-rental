"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { ImageDropzone } from "@/features/shared/components/image-dropzone";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { compressImage } from "@/features/shared/lib/compress-image";
import { assignFilesToSlots } from "@/features/shared/lib/file-accept";
import { removeVehicleGalleryPhotoAction } from "@/features/vehicles/actions/remove-vehicle-gallery-photo-action";
import { saveVehicleGalleryAction } from "@/features/vehicles/actions/save-vehicle-gallery-action";
import {
  VEHICLE_GALLERY_KINDS,
  isCompleteVehicleGallery,
  missingVehicleGalleryLabels,
  type VehiclePhoto,
} from "@/features/vehicles/lib/vehicle-gallery";
import { cn } from "@/lib/utils";

const GALLERY_SLOTS = VEHICLE_GALLERY_KINDS.map((slot) => slot.value);
const LABEL_BY_KIND = new Map<string, string>(
  VEHICLE_GALLERY_KINDS.map((slot) => [slot.value, slot.label]),
);

/** A photo dropped on a slot, from the drop until the refreshed gallery has it. */
type SlotUpload = {
  file: File;
  state: "uploading" | "done" | "error";
  /** The slot's saved photo when the upload began; a new one means it landed. */
  replacing: string | null;
  message?: string;
};

function SlotPreview({
  file,
  url,
  label,
  dimmed,
  action,
}: {
  file: File | null;
  url: string | null;
  label: string;
  dimmed: boolean;
  /** Shown over the corner of a saved photo, e.g. a remove button. */
  action?: ReactNode;
}) {
  const localUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!localUrl) return;
    return () => URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  const src = localUrl ?? url;
  if (!src) {
    return (
      <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
        No photo yet
      </div>
    );
  }
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={label}
        className={cn(
          "h-36 w-full rounded-md border object-cover transition-opacity",
          dimmed && "opacity-60",
        )}
        src={src}
      />
      {action && !localUrl ? (
        <div className="absolute top-2 right-2">{action}</div>
      ) : null}
    </div>
  );
}

export function VehicleGalleryPanel({
  vehicleId,
  photos,
  status,
}: {
  vehicleId: string;
  photos: VehiclePhoto[];
  status?: string | null;
}) {
  const router = useRouter();
  const { runMutation } = useMutationCoordinator();
  const [uploads, setUploads] = useState<Record<string, SlotUpload>>({});
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});

  const byKind = useMemo(() => {
    const map = new Map(photos.map((photo) => [photo.kind, photo]));
    return map;
  }, [photos]);

  const complete = isCompleteVehicleGallery(photos);
  const missing = missingVehicleGalleryLabels(photos);
  const hiddenOnline = status === "available" && !complete;

  async function uploadSlot(kind: string, file: File, replacing: string | null) {
    const formData = new FormData();
    formData.set("vehicle_id", vehicleId);
    formData.set(`gallery_${kind}`, file);
    const result = await saveVehicleGalleryAction(formData);
    setUploads((prev) => ({
      ...prev,
      [kind]: result.success
        ? { file, state: "done", replacing }
        : { file, state: "error", replacing, message: result.message },
    }));
    return result.success;
  }

  function removePhoto(kind: string) {
    runMutation(async () => {
      const result = await removeVehicleGalleryPhotoAction(vehicleId, kind);
      if (!result.success) {
        setRemoveErrors((prev) => ({ ...prev, [kind]: result.message }));
        return;
      }
      const forget = <T,>(prev: Record<string, T>) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      };
      setRemoveErrors(forget);
      // An earlier upload to this slot must not reappear as its preview.
      setUploads(forget);
      toast.success(`Removed the ${LABEL_BY_KIND.get(kind) ?? kind} photo.`);
      router.refresh();
    });
  }

  /** Each photo uploads on its own as soon as it is dropped or picked. */
  function onDrop(start: string, dropped: File[]) {
    if (dropped.length === 0) return;
    const assigned = assignFilesToSlots({
      slots: GALLERY_SLOTS,
      start,
      files: dropped,
      isTaken: (slot) =>
        byKind.has(slot as VehiclePhoto["kind"]) ||
        (uploads[slot] !== undefined && uploads[slot].state !== "error"),
    });
    const replacing = (kind: string) =>
      byKind.get(kind as VehiclePhoto["kind"])?.publicUrl ?? null;

    setUploads((prev) => ({
      ...prev,
      ...Object.fromEntries(
        assigned.map(([kind, file]) => [
          kind,
          { file, state: "uploading", replacing: replacing(kind) },
        ]),
      ),
    }));

    runMutation(async () => {
      const results = await Promise.all(
        assigned.map(([kind, file]) => uploadSlot(kind, file, replacing(kind))),
      );
      const uploaded = assigned
        .filter((_, index) => results[index])
        .map(([kind]) => LABEL_BY_KIND.get(kind) ?? kind);
      if (uploaded.length > 0) {
        toast.success(`Uploaded ${uploaded.join(", ")}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-semibold">Required photo gallery</h3>
        <p className="text-sm text-muted-foreground">
          Front, rear, both sides, interior, and dashboard photos are needed
          before this car shows on the website. Staff can rent it without them.
        </p>
      </div>

      {!complete ? (
        <Alert className="border-warning/30 bg-warning-surface">
          <AlertCircle className="text-warning" />
          <AlertTitle>Not on the website yet</AlertTitle>
          <AlertDescription>
            Missing: {missing.join(", ")}
            {hiddenOnline
              ? ". Staff can still rent this car; customers will see it once these are uploaded."
              : "."}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-success/20 bg-success-surface">
          <CheckCircle2 className="text-success" />
          <AlertTitle>Gallery complete</AlertTitle>
          <AlertDescription>
            All 6 required angles are on file. Front is used as the listing cover.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Photos upload as soon as you drop or pick them. Drop several on one slot
        to fill it and the empty slots after it, in order (front, rear, left,
        right, interior, dashboard).
      </p>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {VEHICLE_GALLERY_KINDS.map((slot) => {
          const current = byKind.get(slot.value);
          const upload = uploads[slot.value];
          // Show the dropped photo until the refreshed gallery replaces it.
          const showLocal =
            upload?.state === "uploading" ||
            (upload?.state === "done" &&
              (current?.publicUrl ?? null) === upload.replacing);
          return (
            <div key={slot.value} className="space-y-2">
              <Label htmlFor={`gallery-${slot.value}`}>
                {slot.label}
                {current ? " ✓" : " *"}
              </Label>
              <SlotPreview
                dimmed={upload?.state === "uploading"}
                file={showLocal ? upload.file : null}
                label={slot.label}
                url={current?.publicUrl ?? null}
                action={
                  current ? (
                    <ConfirmActionDialog
                      confirmLabel="Remove photo"
                      description={`${
                        slot.value === "front"
                          ? "The Front photo is also the listing cover. "
                          : ""
                      }The car comes off the website until all 6 angles are on file again.`}
                      error={removeErrors[slot.value]}
                      icon={Trash2}
                      title={`Remove the ${slot.label} photo?`}
                      trigger={
                        <Button
                          aria-label={`Remove the ${slot.label} photo`}
                          className="bg-background/90 shadow-sm backdrop-blur-sm"
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 />
                        </Button>
                      }
                      onConfirm={() => removePhoto(slot.value)}
                    />
                  ) : null
                }
              />
              <ImageDropzone
                busy={upload?.state === "uploading" ? "Uploading…" : null}
                id={`gallery-${slot.value}`}
                invalid={upload?.state === "error"}
                multiple
                onFiles={(dropped) => onDrop(slot.value, dropped)}
                prepare={compressImage}
              />
              {upload?.state === "error" ? (
                <p className="text-xs text-destructive">{upload.message}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
