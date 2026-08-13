"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RentalInspectionForm } from "@/features/inspections/components/rental-inspection-form";
import type {
  InspectionChecklist,
  InspectionType,
  RentalInspection,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";

export function RentalInspectionSheet({
  rentalId,
  inspectionType,
  checklist,
  knownDamages,
  startingOdometer,
  referenceInspection = null,
  triggerLabel,
}: {
  rentalId: string;
  inspectionType: InspectionType;
  checklist: InspectionChecklist | null;
  knownDamages: VehicleKnownDamage[];
  startingOdometer?: number | null;
  referenceInspection?: RentalInspection | null;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  if (!checklist) {
    return (
      <Button disabled type="button" variant="outline">
        Checklist unavailable
      </Button>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl lg:max-w-4xl"
          side="right"
        >
          <SheetHeader className="shrink-0 gap-1 border-b border-border px-5 py-4 pr-14">
            <SheetTitle>
              {inspectionType === "pickup" ? "Pickup inspection" : "Return inspection"}
            </SheetTitle>
            <SheetDescription>
              Record odometer, fuel, paint/body condition, and the 6 required
              photos before
              {inspectionType === "pickup" ? " starting" : " completing"} this
              rental.
            </SheetDescription>
          </SheetHeader>
          <RentalInspectionForm
            checklist={checklist}
            inspectionType={inspectionType}
            knownDamages={knownDamages}
            referenceInspection={referenceInspection}
            rentalId={rentalId}
            startingOdometer={startingOdometer}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
