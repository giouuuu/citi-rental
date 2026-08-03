"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InspectionBodyMap } from "@/features/inspections/components/inspection-body-map";
import { InspectionChecklistPanel } from "@/features/inspections/components/inspection-checklist-panel";
import { InspectionPhotosStep } from "@/features/inspections/components/inspection-photos-step";
import { InspectionReadingsStep } from "@/features/inspections/components/inspection-readings-step";
import { InspectionSignoffStep } from "@/features/inspections/components/inspection-signoff-step";
import { useInspectionFormState } from "@/features/inspections/hooks/use-inspection-form-state";
import type {
  InspectionChecklist,
  InspectionType,
  RentalInspection,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";

export function RentalInspectionForm({
  rentalId,
  inspectionType,
  checklist,
  knownDamages,
  startingOdometer,
  referenceInspection = null,
  onDone,
}: {
  rentalId: string;
  inspectionType: InspectionType;
  checklist: InspectionChecklist;
  knownDamages: VehicleKnownDamage[];
  startingOdometer?: number | null;
  referenceInspection?: RentalInspection | null;
  onDone: () => void;
}) {
  const form = useInspectionFormState({
    rentalId,
    inspectionType,
    checklist,
    knownDamages,
    startingOdometer,
    referenceInspection,
    onDone,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        {(["readings", "condition", "photos", "signoff"] as const).map((entry) => (
          <button
            key={entry}
            className={
              form.step === entry
                ? "rounded-full bg-teal-700 px-3 py-1 text-white"
                : "rounded-full bg-muted px-3 py-1 text-muted-foreground"
            }
            type="button"
            onClick={() => form.setStep(entry)}
          >
            {entry}
          </button>
        ))}
      </div>

      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}

      {form.step === "readings" ? (
        <InspectionReadingsStep
          cleanliness={form.cleanliness}
          fuelLevel={form.fuelLevel}
          notes={form.notes}
          odor={form.odor}
          odometer={form.odometer}
          onCleanliness={form.setCleanliness}
          onContinue={() => form.setStep("condition")}
          onFuel={form.setFuelLevel}
          onNotes={form.setNotes}
          onOdometer={form.setOdometer}
          onOdor={form.setOdor}
        />
      ) : null}

      {form.step === "condition" ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <InspectionBodyMap
            selectedZone={form.selectedZone}
            zones={form.bodyZones}
            onSelect={(zone) => {
              const match = form.items.find(
                (item) => item.bodyMapZone === zone || item.areaCode === zone,
              );
              form.setSelectedZone(match?.areaCode ?? zone);
            }}
          />
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <InspectionChecklistPanel
              items={form.items}
              selectedAreaCode={form.selectedZone}
              onChange={form.patchItem}
              onSelect={form.setSelectedZone}
            />
          </div>
          <div className="lg:col-span-2">
            <Button type="button" onClick={() => form.setStep("photos")}>
              Continue to photos
            </Button>
          </div>
        </div>
      ) : null}

      {form.step === "photos" ? (
        <InspectionPhotosStep
          damageFiles={form.damageFiles}
          items={form.items}
          overviewFiles={form.overviewFiles}
          referenceInspection={referenceInspection}
          onContinue={() => form.setStep("signoff")}
          onDamage={(areaCode, file) =>
            form.setDamageFiles((prev) => ({ ...prev, [areaCode]: file }))
          }
          onOverview={(kind, file) =>
            form.setOverviewFiles((prev) => ({ ...prev, [kind]: file }))
          }
        />
      ) : null}

      {form.step === "signoff" ? (
        <InspectionSignoffStep
          acknowledged={form.acknowledged}
          damageChargeAmount={form.damageChargeAmount}
          damageChargeNote={form.damageChargeNote}
          fuelChargeAmount={form.fuelChargeAmount}
          fuelChargeNote={form.fuelChargeNote}
          inspectionType={inspectionType}
          newDamageCount={form.newDamageCount}
          pending={form.pending}
          signature={form.signature}
          onAcknowledged={form.setAcknowledged}
          onDamageChargeAmount={form.setDamageChargeAmount}
          onDamageChargeNote={form.setDamageChargeNote}
          onFuelChargeAmount={form.setFuelChargeAmount}
          onFuelChargeNote={form.setFuelChargeNote}
          onSignature={form.setSignature}
          onSubmit={form.submit}
        />
      ) : null}
    </div>
  );
}
