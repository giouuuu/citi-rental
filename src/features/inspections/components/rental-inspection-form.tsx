"use client";

import { useEffect, useRef } from "react";
import { ArrowLeftIcon, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InspectionBodyMap } from "@/features/inspections/components/inspection-body-map";
import { InspectionChecklistPanel } from "@/features/inspections/components/inspection-checklist-panel";
import {
  InspectionPhotosStep,
  missingInspectionPhotos,
} from "@/features/inspections/components/inspection-photos-step";
import { InspectionReadingsStep } from "@/features/inspections/components/inspection-readings-step";
import { InspectionSignoffStep } from "@/features/inspections/components/inspection-signoff-step";
import {
  INSPECTION_STEPS,
  InspectionStepNav,
} from "@/features/inspections/components/inspection-step-nav";
import { useInspectionFormState } from "@/features/inspections/hooks/use-inspection-form-state";
import { isDamageStatus } from "@/features/inspections/lib/checklist-areas";
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

  const bodyRef = useRef<HTMLDivElement>(null);
  const stepIndex = INSPECTION_STEPS.findIndex((entry) => entry.id === form.step);
  const flaggedCount = form.items.filter((item) =>
    isDamageStatus(item.status),
  ).length;
  const { missingRequired, missingDamage } = missingInspectionPhotos({
    items: form.items,
    overviewFiles: form.overviewFiles,
    damageFiles: form.damageFiles,
  });
  const missingPhotoCount = missingRequired.length + missingDamage.length;

  // Every step starts at the top of the single scroll region.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [form.step]);

  // Tapping a body-map panel brings its checklist row into view.
  useEffect(() => {
    if (form.step !== "condition" || !form.selectedZone) return;
    bodyRef.current
      ?.querySelector(`[data-area="${CSS.escape(form.selectedZone)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [form.selectedZone, form.step]);

  function goToStep(next: (typeof INSPECTION_STEPS)[number]["id"]) {
    form.setStep(next);
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-3">
        <InspectionStepNav step={form.step} onSelect={goToStep} />
      </div>

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        {form.error ? (
          <Alert className="mb-4" variant="destructive">
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
            onFuel={form.setFuelLevel}
            onNotes={form.setNotes}
            onOdometer={form.setOdometer}
            onOdor={form.setOdor}
          />
        ) : null}

        {form.step === "condition" ? (
          <div className="grid gap-5 @3xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] @3xl:items-start">
            <InspectionBodyMap
              className="mx-auto w-full max-w-sm @3xl:sticky @3xl:top-0 @3xl:mx-0 @3xl:max-w-none"
              selectedZone={form.selectedZone}
              zones={form.bodyZones}
              onSelect={(zone) => {
                const match = form.items.find(
                  (item) => item.bodyMapZone === zone || item.areaCode === zone,
                );
                form.setSelectedZone(match?.areaCode ?? zone);
              }}
            />
            <InspectionChecklistPanel
              items={form.items}
              selectedAreaCode={form.selectedZone}
              onChange={form.patchItem}
              onSelect={form.setSelectedZone}
            />
          </div>
        ) : null}

        {form.step === "photos" ? (
          <InspectionPhotosStep
            damageFiles={form.damageFiles}
            items={form.items}
            overviewFiles={form.overviewFiles}
            referenceInspection={referenceInspection}
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
            signature={form.signature}
            onAcknowledged={form.setAcknowledged}
            onDamageChargeAmount={form.setDamageChargeAmount}
            onDamageChargeNote={form.setDamageChargeNote}
            onFuelChargeAmount={form.setFuelChargeAmount}
            onFuelChargeNote={form.setFuelChargeNote}
            onSignature={form.setSignature}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(INSPECTION_STEPS[stepIndex - 1].id)}
            >
              <ArrowLeftIcon />
              Back
            </Button>
          ) : null}
          <p className="truncate text-xs text-muted-foreground">
            {form.step === "condition"
              ? flaggedCount > 0
                ? `${flaggedCount} panel${flaggedCount === 1 ? "" : "s"} flagged`
                : "No damage flagged yet"
              : null}
            {form.step === "photos"
              ? missingPhotoCount > 0
                ? `Still needed: ${[
                    ...missingRequired.map((kind) => kind.label),
                    ...missingDamage.map((item) => item.label),
                  ]
                    .slice(0, 2)
                    .join(", ")}${missingPhotoCount > 2 ? ` +${missingPhotoCount - 2} more` : ""}`
                : "All required photos captured"
              : null}
          </p>
        </div>

        {form.step === "signoff" ? (
          <Button disabled={form.pending} type="button" onClick={form.submit}>
            {form.pending ? <LoaderCircle className="animate-spin" /> : null}
            {inspectionType === "pickup"
              ? "Submit & start rental"
              : "Submit & complete rental"}
          </Button>
        ) : (
          <Button
            disabled={form.step === "photos" && missingPhotoCount > 0}
            type="button"
            onClick={() => goToStep(INSPECTION_STEPS[stepIndex + 1].id)}
          >
            Continue to {INSPECTION_STEPS[stepIndex + 1].label.toLowerCase()}
          </Button>
        )}
      </div>
    </div>
  );
}
