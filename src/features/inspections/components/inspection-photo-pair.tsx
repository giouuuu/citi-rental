import Image from "next/image";

import type { InspectionPhoto } from "@/features/inspections/types/inspection";

export function InspectionPhotoPair({
  label,
  before,
  after,
}: {
  label: string;
  before?: InspectionPhoto | null;
  after?: InspectionPhoto | null;
}) {
  if (!before?.signedUrl && !after?.signedUrl) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
          {before?.signedUrl ? (
            <Image
              alt={`${label} pickup`}
              className="object-cover"
              fill
              sizes="160px"
              src={before.signedUrl}
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No pickup photo
            </span>
          )}
        </div>
        <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
          {after?.signedUrl ? (
            <Image
              alt={`${label} return`}
              className="object-cover"
              fill
              sizes="160px"
              src={after.signedUrl}
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No return photo
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
        <span>Pickup</span>
        <span>Return</span>
      </div>
    </div>
  );
}
