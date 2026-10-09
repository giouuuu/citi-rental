import Image from "next/image";
import { PlayIcon } from "lucide-react";

import { photoKindLabel } from "@/features/inspections/lib/checklist-areas";
import { isVideoPath } from "@/features/inspections/lib/inspection-media";
import type { InspectionPhoto } from "@/features/inspections/types/inspection";
import { cn } from "@/lib/utils";

/**
 * Saved inspection photos and videos as a tile grid. Each tile opens the
 * full-size file in a new tab. Older inspections' fixed angles keep their
 * label (Front, Rear…).
 */
export function InspectionMediaGrid({
  media,
  emptyLabel = "No photos or videos.",
  className,
}: {
  media: InspectionPhoto[];
  emptyLabel?: string;
  className?: string;
}) {
  const shown = media.filter((item) => item.signedUrl);
  if (shown.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}>
      {shown.map((item) => {
        const video = isVideoPath(item.storagePath);
        const label =
          item.caption ?? (item.kind === "other" ? null : photoKindLabel(item.kind));
        return (
          <li key={item.id}>
            <a
              aria-label={`Open ${video ? "video" : "photo"}${label ? ` (${label})` : ""}`}
              className="group relative block aspect-square overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={item.signedUrl!}
              rel="noreferrer"
              target="_blank"
            >
              {video ? (
                <>
                  <video
                    className="size-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    src={`${item.signedUrl}#t=0.1`}
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                      <PlayIcon className="size-4 translate-x-px fill-current" />
                    </span>
                  </span>
                </>
              ) : (
                <Image
                  alt={label ?? "Inspection photo"}
                  className="object-cover transition-transform group-hover:scale-[1.03]"
                  fill
                  sizes="160px"
                  src={item.signedUrl!}
                  unoptimized
                />
              )}
              {label ? (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {label}
                </span>
              ) : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
