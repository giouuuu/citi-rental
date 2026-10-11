"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AgreementDraft } from "@/features/agreements/types";
import { InspectionBodyMap } from "@/features/inspections/components/inspection-body-map";
import { InspectionChecklistPanel } from "@/features/inspections/components/inspection-checklist-panel";
import {
  InspectionMediaStep,
  missingInspectionMedia,
} from "@/features/inspections/components/inspection-media-step";
import { InspectionReadingsStep } from "@/features/inspections/components/inspection-readings-step";
import {
  InspectionReviewDialog,
  type InspectionReviewRow,
} from "@/features/inspections/components/inspection-review-dialog";
import {
  RETURN_PAYMENT_METHODS,
  describeLateness,
  type ReturnSettlementControls,
} from "@/features/inspections/components/return-settlement-panel";
import { InspectionSignoffStep } from "@/features/inspections/components/inspection-signoff-step";
import {
  InspectionStepNav,
  inspectionSteps,
} from "@/features/inspections/components/inspection-step-nav";
import {
  type InspectionFormStep,
  useInspectionFormState,
} from "@/features/inspections/hooks/use-inspection-form-state";
import { isDamageStatus } from "@/features/inspections/lib/checklist-areas";
import { MIN_INSPECTION_PHOTOS } from "@/features/inspections/lib/inspection-media";
import type { ReturnBillContext } from "@/features/inspections/lib/return-settlement";
import { formatPhpExact } from "@/features/shared/lib/money";
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
  agreementDraft = null,
  returnBill = null,
  onDone,
}: {
  rentalId: string;
  inspectionType: InspectionType;
  checklist: InspectionChecklist;
  knownDamages: VehicleKnownDamage[];
  startingOdometer?: number | null;
  referenceInspection?: RentalInspection | null;
  agreementDraft?: AgreementDraft | null;
  returnBill?: ReturnBillContext | null;
  onDone: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const form = useInspectionFormState({
    agreementDraft,
    returnBill,
    rentalId,
    inspectionType,
    checklist,
    knownDamages,
    startingOdometer,
    referenceInspection,
    onDone,
  });

  const bodyRef = useRef<HTMLDivElement>(null);
  const steps = inspectionSteps(inspectionType);
  const stepIndex = steps.findIndex((entry) => entry.id === form.step);
  const lastStep = stepIndex === steps.length - 1;
  const flaggedCount = form.items.filter((item) =>
    isDamageStatus(item.status),
  ).length;
  const { readyCount, readyPhotoCount, compressingCount, missingDamage } =
    missingInspectionMedia({
      items: form.items,
      media: form.gallery.media,
      damageFiles: form.damageFiles,
    });
  // Only the required photos and close-ups gate the step; videos still
  // compressing or uploading are optional.
  const mediaBlocked =
    readyPhotoCount < MIN_INSPECTION_PHOTOS || missingDamage.length > 0;
  const galleryTotal = form.gallery.media.filter(
    (entry) => entry.status === "ready",
  ).length;
  const galleryUploaded = form.gallery.media.filter(
    (entry) => entry.upload === "uploaded",
  ).length;

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

  const settle: ReturnSettlementControls | null =
    returnBill && form.settlement
      ? {
          late: form.late,
          early: form.early,
          lateChargeAmount: form.lateChargeAmount,
          lateChargeWaived: form.lateChargeWaived,
          lateChargeNote: form.lateChargeNote,
          onLateChargeAmount: form.setLateChargeAmount,
          onLateChargeWaived: form.setLateChargeWaived,
          onLateChargeNote: form.setLateChargeNote,
          billTotal: returnBill.billTotal,
          paid: returnBill.paid,
          settlement: form.settlement,
          paymentAmount: form.paymentAmount,
          paymentMethod: form.paymentMethod,
          paymentReference: form.paymentReference,
          onPaymentAmount: form.setPaymentAmount,
          onPaymentMethod: form.setPaymentMethod,
          onPaymentReference: form.setPaymentReference,
        }
      : null;

  const reviewRows = buildReviewRows({
    inspectionType,
    form,
    flaggedCount,
    galleryCount: galleryTotal,
    startingOdometer: startingOdometer ?? null,
    settle,
  });

  function goToStep(next: InspectionFormStep) {
    form.setStep(next);
  }

  function goForward() {
    // Pickup signs first: the agreement must be complete before the walk-around.
    if (form.step === "signoff" && !form.validateSigning()) return;
    goToStep(steps[stepIndex + 1].id);
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-3">
        <InspectionStepNav steps={steps} step={form.step} onSelect={goToStep} />
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
          <InspectionMediaStep
            damageFiles={form.damageFiles}
            items={form.items}
            limitNotice={form.gallery.limitNotice}
            media={form.gallery.media}
            referenceInspection={referenceInspection}
            onAddMedia={form.gallery.addFiles}
            onDamage={(areaCode, file) =>
              form.setDamageFiles((prev) => ({ ...prev, [areaCode]: file }))
            }
            onRemoveMedia={form.gallery.remove}
            onRetryMedia={(id) => void form.gallery.retry(id)}
          />
        ) : null}

        {form.step === "signoff" ? (
          <InspectionSignoffStep
            acknowledged={form.acknowledged}
            agreement={
              inspectionType === "pickup" && agreementDraft
                ? {
                    draft: agreementDraft,
                    renterAddress: form.renterAddress,
                    accepted: form.agreementAccepted,
                    companySignature: form.companySignature,
                    onRenterAddress: form.setRenterAddress,
                    onAccepted: form.setAgreementAccepted,
                    onCompanySignature: form.setCompanySignature,
                  }
                : null
            }
            damageChargeAmount={form.damageChargeAmount}
            damageChargeNote={form.damageChargeNote}
            fuelChargeAmount={form.fuelChargeAmount}
            fuelChargeNote={form.fuelChargeNote}
            inspectionType={inspectionType}
            newDamageCount={form.newDamageCount}
            settle={settle}
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
              onClick={() => goToStep(steps[stepIndex - 1].id)}
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
            {lastStep && form.uploadStatus ? form.uploadStatus : null}
            {form.phase === "gallery"
              ? `Uploading photos & videos: ${galleryUploaded} of ${galleryTotal}…`
              : null}
            {form.phase === "saving" ? "Saving inspection…" : null}
            {form.step === "photos" && form.phase === "idle"
              ? readyPhotoCount < MIN_INSPECTION_PHOTOS
                ? compressingCount > 0
                  ? `Compressing ${compressingCount} file${compressingCount === 1 ? "" : "s"}…`
                  : `Add at least ${MIN_INSPECTION_PHOTOS} photos`
                : missingDamage.length > 0
                    ? `Still needed: ${missingDamage
                        .slice(0, 2)
                        .map((item) => `${item.label} close-up`)
                        .join(", ")}${missingDamage.length > 2 ? ` +${missingDamage.length - 2} more` : ""}`
                  : compressingCount > 0
                    ? `${readyCount} ready · compressing ${compressingCount} more`
                    : `${readyCount} photo${readyCount === 1 ? "" : "s"} & video${readyCount === 1 ? "" : "s"} ready`
              : null}
          </p>
        </div>

        {lastStep ? (
          <div className="flex shrink-0 items-center gap-2">
            {form.canSkipUploads ? (
              <Button
                type="button"
                variant="outline"
                onClick={form.skipRemainingUploads}
              >
                {inspectionType === "pickup" ? "Skip & add later" : "Skip the rest"}
              </Button>
            ) : null}
            <Button
              disabled={form.pending}
              type="button"
              onClick={() => {
                if (form.validate()) setReviewOpen(true);
              }}
            >
              {form.pending ? <LoaderCircle className="animate-spin" /> : null}
              {inspectionType === "pickup"
                ? "Submit & start rental"
                : "Submit & complete rental"}
            </Button>
          </div>
        ) : (
          <Button
            disabled={form.step === "photos" && mediaBlocked}
            type="button"
            onClick={goForward}
          >
            Continue to {steps[stepIndex + 1].label.toLowerCase()}
          </Button>
        )}
      </div>

      <InspectionReviewDialog
        confirmLabel={
          inspectionType === "pickup" ? "Release the car" : "Complete the rental"
        }
        description={
          inspectionType === "pickup"
            ? "Check what will be saved before the car leaves."
            : "Check the charges and payment before the rental closes."
        }
        open={reviewOpen}
        rows={reviewRows}
        title={
          inspectionType === "pickup"
            ? "Start this rental?"
            : "Complete this rental?"
        }
        understanding={
          inspectionType === "pickup"
            ? "I understand that submitting releases the car to the renter and starts the rental, and that this condition report and the signed rental agreement are saved as the record of the car at pickup."
            : "I understand that submitting completes the rental, adds the charges above to the bill, and records the payment on the ledger. This condition report is saved as the record of the car at return."
        }
        onConfirm={() => {
          setReviewOpen(false);
          void form.submit();
        }}
        onOpenChange={setReviewOpen}
      />
    </div>
  );
}

const FUEL = (level: string) => `${Number(level) || 0}%`;

function buildReviewRows({
  inspectionType,
  form,
  flaggedCount,
  galleryCount,
  startingOdometer,
  settle,
}: {
  inspectionType: InspectionType;
  form: ReturnType<typeof useInspectionFormState>;
  flaggedCount: number;
  galleryCount: number;
  startingOdometer: number | null;
  settle: ReturnSettlementControls | null;
}): InspectionReviewRow[] {
  const odometer = Number(form.odometer) || 0;
  const driven =
    inspectionType === "return" && startingOdometer != null
      ? ` (${(odometer - startingOdometer).toLocaleString("en-PH")} km driven)`
      : "";
  const rows: InspectionReviewRow[] = [
    { label: "Odometer", value: `${odometer.toLocaleString("en-PH")} km${driven}` },
    { label: "Fuel", value: FUEL(form.fuelLevel) },
    {
      label: inspectionType === "return" ? "New damage" : "Panels flagged",
      value:
        inspectionType === "return"
          ? form.newDamageCount > 0
            ? `${form.newDamageCount} panel${form.newDamageCount === 1 ? "" : "s"}`
            : "None"
          : flaggedCount > 0
            ? `${flaggedCount} panel${flaggedCount === 1 ? "" : "s"}`
            : "None",
    },
    { label: "Photos & videos", value: String(galleryCount) },
  ];

  if (inspectionType === "pickup") {
    rows.push({ label: "Rental agreement", value: "Signed by the renter" });
    return rows;
  }

  const money = (value: string) => Number(value) || 0;
  if (money(form.fuelChargeAmount) > 0) {
    rows.push({ label: "Fuel charge", value: formatPhpExact(money(form.fuelChargeAmount)) });
  }
  if (money(form.damageChargeAmount) > 0) {
    rows.push({
      label: "Damage penalty",
      value: formatPhpExact(money(form.damageChargeAmount)),
    });
  }
  if (form.late) {
    rows.push({
      label: `Late return (${describeLateness(form.late.hoursLate)})`,
      value: form.lateChargeWaived
        ? "Waived"
        : formatPhpExact(money(form.lateChargeAmount)),
    });
  }
  if (!settle) return rows;

  const { settlement } = settle;
  const payment = money(form.paymentAmount);
  const method =
    RETURN_PAYMENT_METHODS.find((entry) => entry.value === form.paymentMethod)?.label ??
    form.paymentMethod;
  rows.push(
    { label: "Balance due", value: formatPhpExact(settlement.balanceDue), tone: "strong" },
    {
      label: "Payment received",
      value: payment > 0 ? `${formatPhpExact(payment)} · ${method}` : "None",
    },
    settlement.balanceAfter > 0
      ? {
          label: "Still unpaid",
          value: formatPhpExact(settlement.balanceAfter),
          tone: "warn",
        }
      : { label: "Bill", value: "Paid in full", tone: "strong" },
  );
  return rows;
}
