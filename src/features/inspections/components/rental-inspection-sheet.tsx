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
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="right">
          <SheetHeader>
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
          <div className="mt-4 px-4 pb-6">
            <RentalInspectionForm
              checklist={checklist}
              inspectionType={inspectionType}
              knownDamages={knownDamages}
              referenceInspection={referenceInspection}
              rentalId={rentalId}
              startingOdometer={startingOdometer}
              onDone={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
