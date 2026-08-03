"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVehicleGalleryAction } from "@/features/vehicles/actions/save-vehicle-gallery-action";
import {
  VEHICLE_GALLERY_KINDS,
  isCompleteVehicleGallery,
  missingVehicleGalleryLabels,
  type VehiclePhoto,
} from "@/features/vehicles/lib/vehicle-gallery";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});

  const byKind = useMemo(() => {
    const map = new Map(photos.map((photo) => [photo.kind, photo]));
    return map;
  }, [photos]);

  const complete = isCompleteVehicleGallery(photos);
  const missing = missingVehicleGalleryLabels(photos);
  const availableBlocked = status === "available" && !complete;

  function onSubmit() {
    setError("");
    setSuccess("");
    const formData = new FormData();
    formData.set("vehicle_id", vehicleId);
    let hasFile = false;
    for (const [kind, file] of Object.entries(files)) {
      if (!file) continue;
      formData.set(`gallery_${kind}`, file);
      hasFile = true;
    }
    if (!hasFile) {
      setError("Choose at least one photo to upload.");
      return;
    }

    startTransition(async () => {
      const result = await saveVehicleGalleryAction(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setFiles({});
      setSuccess(
        `Uploaded ${result.data?.uploaded.join(", ") ?? "photos"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-semibold">Required photo gallery</h3>
        <p className="text-sm text-muted-foreground">
          Every vehicle needs front, rear, both sides, interior, and dashboard
          photos before it can be set to available.
        </p>
      </div>

      {!complete ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Gallery incomplete</AlertTitle>
          <AlertDescription>
            Missing: {missing.join(", ")}
            {availableBlocked
              ? ". Upload the missing angles before booking this car."
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

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-success/20 bg-success-surface">
          <CheckCircle2 className="text-success" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {VEHICLE_GALLERY_KINDS.map((slot) => {
          const current = byKind.get(slot.value);
          return (
            <div key={slot.value} className="space-y-2">
              <Label htmlFor={`gallery-${slot.value}`}>
                {slot.label}
                {current ? " ✓" : " *"}
              </Label>
              {current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={slot.label}
                  className="h-36 w-full rounded-md border object-cover"
                  src={current.publicUrl}
                />
              ) : (
                <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                  No photo yet
                </div>
              )}
              <Input
                accept="image/jpeg,image/png,image/webp,image/gif"
                id={`gallery-${slot.value}`}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setFiles((prev) => ({ ...prev, [slot.value]: file }));
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button disabled={pending} type="button" onClick={onSubmit}>
          {pending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Upload />
          )}
          {pending ? "Uploading…" : "Upload selected photos"}
        </Button>
      </div>
    </div>
  );
}
