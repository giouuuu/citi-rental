"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlusIcon, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addInspectionMediaAction } from "@/features/inspections/actions/add-inspection-media-action";
import { MediaDraftTile } from "@/features/inspections/components/inspection-media-step";
import { useInspectionMedia } from "@/features/inspections/hooks/use-inspection-media";
import { ImageDropzone } from "@/features/shared/components/image-dropzone";
import { VIDEO_MAX_SECONDS } from "@/features/shared/lib/compress-video";

/**
 * Attach the photos and videos that failed or were skipped at the handover.
 * Files compress and upload as soon as they are picked; Save attaches them.
 */
function AddMediaForm({
  rentalId,
  inspectionId,
  roomLeft,
  onDone,
}: {
  rentalId: string;
  inspectionId: string;
  roomLeft: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const gallery = useInspectionMedia({ rentalId, maxItems: roomLeft });
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [saving, startTransition] = useTransition();
  const [pickKey, setPickKey] = useState(0);

  const busy = waiting || saving;
  const uploadedCount = gallery.media.filter(
    (entry) => entry.upload === "uploaded",
  ).length;
  const readyCount = gallery.ready.length;

  async function save() {
    setError("");
    setWaiting(true);
    const uploaded = await gallery.settle();
    setWaiting(false);
    if (uploaded.length === 0) {
      setError(
        gallery.ready.length > 0
          ? "Nothing uploaded. Check the connection and try again."
          : "Add at least one photo or video.",
      );
      return;
    }
    const leftOut = gallery.media.length - uploaded.length;
    startTransition(async () => {
      const result = await addInspectionMediaAction({
        rentalId,
        inspectionId,
        paths: uploaded.map((entry) => entry.path),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      gallery.reset();
      const added = result.data?.added ?? uploaded.length;
      toast.success(
        `${added} photo${added === 1 ? "" : "s"} or video${added === 1 ? "" : "s"} added`,
        leftOut > 0
          ? { description: `${leftOut} didn't upload — add them again.` }
          : undefined,
      );
      router.refresh();
      onDone();
    });
  }

  return (
    <>
      <div className="min-h-0 space-y-3 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <ImageDropzone
          key={pickKey}
          accept="image/*,video/*"
          disabled={busy || gallery.media.length >= roomLeft}
          hint={`Videos up to ${VIDEO_MAX_SECONDS} seconds. ${roomLeft} more allowed on this inspection.`}
          id={`add-media-${inspectionId}`}
          multiple
          noun="photos or videos"
          value={null}
          onFiles={(files) => {
            if (files.length === 0) return;
            gallery.addFiles(files);
            setPickKey((key) => key + 1);
          }}
        />
        {gallery.limitNotice ? (
          <p aria-live="polite" className="text-xs text-destructive">
            {gallery.limitNotice}
          </p>
        ) : null}
        {gallery.media.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.media.map((draft) => (
              <MediaDraftTile
                key={draft.id}
                draft={draft}
                onRemove={() => gallery.remove(draft.id)}
                onRetry={() => void gallery.retry(draft.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {gallery.compressingCount > 0
            ? `Compressing ${gallery.compressingCount}…`
            : readyCount > 0
              ? `${uploadedCount} of ${readyCount} uploaded`
              : null}
        </p>
        <Button
          disabled={busy || readyCount === 0}
          onClick={() => void save()}
          type="button"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          {waiting ? "Finishing uploads…" : "Add to inspection"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AddInspectionMediaDialog({
  rentalId,
  inspectionId,
  roomLeft,
}: {
  rentalId: string;
  inspectionId: string;
  roomLeft: number;
}) {
  const [open, setOpen] = useState(false);
  if (roomLeft <= 0) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
        <ImagePlusIcon />
        Add photos &amp; videos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add photos &amp; videos</DialogTitle>
            <DialogDescription>
              For files that didn&apos;t upload at the handover. They&apos;re
              marked &ldquo;Added later&rdquo; on the inspection.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <AddMediaForm
              inspectionId={inspectionId}
              rentalId={rentalId}
              roomLeft={roomLeft}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
