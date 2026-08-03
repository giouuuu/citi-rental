import Image from "next/image";
import Link from "next/link";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { InspectionComparison } from "@/features/inspections/components/inspection-comparison";
import { statusLabel } from "@/features/inspections/lib/checklist-areas";
import type { RentalInspection } from "@/features/inspections/types/inspection";

function InspectionSummaryCard({ inspection }: { inspection: RentalInspection }) {
  const issues = inspection.items.filter((item) => item.status !== "ok");

  return (
    <article className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold capitalize">
            {inspection.inspectionType} inspection
          </h3>
          <p className="text-xs text-muted-foreground">
            {new Date(inspection.inspectedAt).toLocaleString("en-PH")}
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
      {inspection.photos.filter((photo) => photo.signedUrl).length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {inspection.photos
            .filter((photo) => photo.signedUrl && photo.kind !== "signature")
            .slice(0, 8)
            .map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
              >
                <Image
                  alt={photo.caption ?? photo.kind}
                  className="object-cover"
                  fill
                  sizes="120px"
                  src={photo.signedUrl!}
                  unoptimized
                />
              </div>
            ))}
        </div>
      ) : null}
      {inspection.customerAcknowledgedAt ? (
        <p className="text-xs text-teal-700">Customer acknowledged</p>
      ) : null}
    </article>
  );
}

export function RentalInspectionsTab({
  rentalId,
  inspections,
}: {
  rentalId: string;
  inspections: RentalInspection[];
}) {
  const pickup = inspections.find((row) => row.inspectionType === "pickup");
  const ret = inspections.find((row) => row.inspectionType === "return");

  if (inspections.length === 0) {
    return (
      <Empty className="border border-dashed py-10">
        <EmptyHeader>
          <EmptyTitle>No condition inspections yet</EmptyTitle>
          <EmptyDescription>
            Use Start or Complete to run a pickup or return inspection.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={`/rentals/${rentalId}/inspection-report`} target="_blank">
            <Printer /> Printable report
          </Link>
        </Button>
      </div>
      <InspectionComparison pickup={pickup} ret={ret} />
      {inspections.map((inspection) => (
        <InspectionSummaryCard key={inspection.id} inspection={inspection} />
      ))}
    </div>
  );
}
