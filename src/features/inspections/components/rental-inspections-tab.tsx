import Link from "next/link";
import { FileSearch, FileSignature, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { AddInspectionMediaDialog } from "@/features/inspections/components/add-inspection-media-dialog";
import { InspectionComparison } from "@/features/inspections/components/inspection-comparison";
import { InspectionMediaGrid } from "@/features/inspections/components/inspection-media-grid";
import { statusLabel } from "@/features/inspections/lib/checklist-areas";
import {
  MAX_GALLERY_ITEMS,
  galleryMedia,
} from "@/features/inspections/lib/inspection-media";
import { formatManila } from "@/features/shared/lib/manila-time";
import type { RentalInspection } from "@/features/inspections/types/inspection";

function InspectionSummaryCard({
  inspection,
  canAddMedia,
}: {
  inspection: RentalInspection;
  /** Late photos and videos are accepted until the rental is completed. */
  canAddMedia: boolean;
}) {
  const issues = inspection.items.filter((item) => item.status !== "ok");
  const roomLeft = MAX_GALLERY_ITEMS - galleryMedia(inspection.photos).length;

  return (
    <article className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold capitalize">
            {inspection.inspectionType} inspection
          </h3>
          <p className="text-xs text-muted-foreground">
            {formatManila(inspection.inspectedAt, "stamp")}
          </p>
        </div>
        <p className="text-sm tabular-nums">
          {inspection.odometer.toLocaleString()} km · {inspection.fuelLevel}% fuel
        </p>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No issues recorded.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {issues.map((item) => (
            <li key={item.id}>
              {item.label}: {statusLabel(item.status)}
              {item.notes ? ` — ${item.notes}` : ""}
            </li>
          ))}
        </ul>
      )}
      <InspectionMediaGrid
        className="sm:grid-cols-6"
        media={inspection.photos.filter((photo) => photo.kind !== "signature")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {inspection.customerAcknowledgedAt ? (
          <p className="text-xs text-teal-700">Customer acknowledged</p>
        ) : (
          <span />
        )}
        {canAddMedia ? (
          <AddInspectionMediaDialog
            inspectionId={inspection.id}
            rentalId={inspection.rentalId}
            roomLeft={roomLeft}
          />
        ) : null}
      </div>
    </article>
  );
}

export function RentalInspectionsTab({
  rentalId,
  inspections,
  rentalStatus,
  hasAgreement = false,
}: {
  rentalId: string;
  inspections: RentalInspection[];
  rentalStatus: string;
  /** A rental agreement was signed at release. */
  hasAgreement?: boolean;
}) {
  const pickup = inspections.find((row) => row.inspectionType === "pickup");
  const ret = inspections.find((row) => row.inspectionType === "return");

  // Try the agreement with this rental's details, without releasing the car.
  const previewAgreement = (
    <Button asChild size="sm" variant="outline">
      <Link href={`/rentals/${rentalId}/agreement/preview`} target="_blank">
        <FileSearch /> Preview agreement
      </Link>
    </Button>
  );

  if (inspections.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{previewAgreement}</div>
        <Empty className="border border-dashed py-10">
          <EmptyHeader>
            <EmptyTitle>No condition inspections yet</EmptyTitle>
            <EmptyDescription>
              Use Start or Complete to run a pickup or return inspection.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {previewAgreement}
        {hasAgreement ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/rentals/${rentalId}/agreement`} target="_blank">
              <FileSignature /> Rental agreement
            </Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link href={`/rentals/${rentalId}/inspection-report`} target="_blank">
            <Printer /> Printable report
          </Link>
        </Button>
      </div>
      <InspectionComparison pickup={pickup} ret={ret} />
      {inspections.map((inspection) => (
        <InspectionSummaryCard
          key={inspection.id}
          canAddMedia={rentalStatus !== "completed" && rentalStatus !== "cancelled"}
          inspection={inspection}
        />
      ))}
    </div>
  );
}
