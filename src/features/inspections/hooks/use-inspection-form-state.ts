"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AgreementDraft } from "@/features/agreements/types";
import type { ChecklistDraftItem } from "@/features/inspections/components/inspection-checklist-panel";
import { useInspectionMedia } from "@/features/inspections/hooks/use-inspection-media";
import { isDamageStatus } from "@/features/inspections/lib/checklist-areas";
import {
  mapWithConcurrency,
  uploadInspectionMedia,
} from "@/features/inspections/lib/upload-inspection-media";
import {
  compareInspections,
  summarizeInspectionDelta,
} from "@/features/inspections/lib/compare-inspections";
import { submitRentalInspectionAction } from "@/features/inspections/actions/actions";
import type {
  InspectionChecklist,
  InspectionType,
  RentalInspection,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";

export type InspectionFormStep = "readings" | "condition" | "photos" | "signoff";

export function useInspectionFormState(options: {
  rentalId: string;
  inspectionType: InspectionType;
  checklist: InspectionChecklist;
  knownDamages: VehicleKnownDamage[];
  startingOdometer?: number | null;
  referenceInspection?: RentalInspection | null;
  agreementDraft?: AgreementDraft | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [submitting, startTransition] = useTransition();
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  // A retry after a failed submit reuses what already reached storage.
  const uploadedPaths = useRef(new Map<File, string>());
  // Pickup opens on signing; return opens on readings.
  const [step, setStep] = useState<InspectionFormStep>(
    options.inspectionType === "pickup" ? "signoff" : "readings",
  );
  const [error, setError] = useState("");
  const [odometer, setOdometer] = useState(
    options.startingOdometer != null ? String(options.startingOdometer) : "",
  );
  const [fuelLevel, setFuelLevel] = useState("100");
  const [cleanliness, setCleanliness] = useState("clean");
  const [odor, setOdor] = useState("none");
  const [notes, setNotes] = useState("");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fuelChargeAmount, setFuelChargeAmount] = useState("");
  const [fuelChargeNote, setFuelChargeNote] = useState("");
  const [damageChargeAmount, setDamageChargeAmount] = useState("");
  const [damageChargeNote, setDamageChargeNote] = useState("");
  const gallery = useInspectionMedia();
  const agreementDraft =
    options.inspectionType === "pickup" ? (options.agreementDraft ?? null) : null;
  const [renterAddress, setRenterAddress] = useState(
    agreementDraft?.parties.renterAddress ?? "",
  );
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [companySignature, setCompanySignature] = useState<string | null>(null);
  const [damageFiles, setDamageFiles] = useState<Record<string, File | null>>({});
  const [items, setItems] = useState<ChecklistDraftItem[]>(() =>
    options.checklist.items.map((item) => {
      const known = options.knownDamages.find(
        (damage) => damage.areaCode === item.areaCode,
      );
      return {
        ...item,
        status: known?.status ?? "ok",
        severity: known?.severity ?? null,
        notes: known?.notes ?? "",
      };
    }),
  );

  const bodyZones = useMemo(
    () =>
      items
        .filter((item) => item.bodyMapZone)
        .map((item) => ({ zone: item.bodyMapZone!, status: item.status })),
    [items],
  );

  const provisionalReturn = useMemo(
    () =>
      ({
        id: "draft",
        rentalId: options.rentalId,
        inspectionType: "return" as const,
        templateId: options.checklist.templateId,
        odometer: Number(odometer) || 0,
        fuelLevel: Number(fuelLevel) || 0,
        cleanliness: cleanliness as RentalInspection["cleanliness"],
        odor: odor as RentalInspection["odor"],
        notes: notes || null,
        fuelChargeAmount: null,
        fuelChargeNote: null,
        damageChargeAmount: null,
        damageChargeNote: null,
        fuelPaymentId: null,
        damagePaymentId: null,
        customerSignaturePath: null,
        customerAcknowledgedAt: null,
        inspectedBy: null,
        inspectedAt: new Date().toISOString(),
        items: items.map((item) => ({
          id: item.areaCode,
          areaCode: item.areaCode,
          label: item.label,
          itemGroup: item.itemGroup,
          bodyMapZone: item.bodyMapZone,
          status: item.status,
          severity: item.severity,
          notes: item.notes || null,
        })),
        photos: [],
      }) satisfies RentalInspection,
    [
      cleanliness,
      fuelLevel,
      items,
      notes,
      odometer,
      odor,
      options.checklist.templateId,
      options.rentalId,
    ],
  );

  const newDamageCount = useMemo(() => {
    if (options.inspectionType !== "return") return 0;
    return summarizeInspectionDelta(
      compareInspections(options.referenceInspection, provisionalReturn),
    ).newDamage.length;
  }, [options.inspectionType, options.referenceInspection, provisionalReturn]);

  function patchItem(areaCode: string, patch: Partial<ChecklistDraftItem>) {
    setItems((prev) =>
      prev.map((item) =>
        item.areaCode === areaCode ? { ...item, ...patch } : item,
      ),
    );
  }

  function signingError() {
    if (!agreementDraft) return null;
    return !signature
      ? "The renter must sign the rental agreement."
      : !renterAddress.trim()
        ? "Enter the renter's address for the rental agreement."
        : !agreementDraft.companySignatureUrl && !companySignature
          ? "Add the company signature to the rental agreement."
          : !agreementAccepted
            ? "Confirm the renter agrees to the rental agreement."
            : null;
  }

  /** Keeps the form on signing until the agreement is complete. */
  function validateSigning() {
    const message = signingError();
    if (message) {
      setError(message);
      setStep("signoff");
      return false;
    }
    setError("");
    return true;
  }

  async function uploadAll(
    entries: Array<{ file: File; kind: string; area_code?: string }>,
  ) {
    let done = 0;
    setUploadStatus(`Uploading 0 of ${entries.length}…`);
    try {
      return await mapWithConcurrency(entries, 3, async (entry) => {
        let path = uploadedPaths.current.get(entry.file);
        if (!path) {
          path = await uploadInspectionMedia({
            rentalId: options.rentalId,
            file: entry.file,
            kind: entry.kind,
          });
          uploadedPaths.current.set(entry.file, path);
        }
        done += 1;
        setUploadStatus(`Uploading ${done} of ${entries.length}…`);
        return { storage_path: path, kind: entry.kind, area_code: entry.area_code };
      });
    } finally {
      setUploadStatus(null);
    }
  }

  async function submit() {
    setError("");
    for (const item of items.filter((entry) => isDamageStatus(entry.status))) {
      if (!damageFiles[item.areaCode]) {
        setError(`Add a close-up photo for ${item.label}.`);
        setStep("photos");
        return;
      }
    }
    if (gallery.compressingCount > 0) {
      setError("Wait for the photos and videos to finish compressing.");
      setStep("photos");
      return;
    }
    if (gallery.ready.length === 0) {
      setError("Add at least one photo or video of the car.");
      setStep("photos");
      return;
    }
    if (!validateSigning()) return;
    if (
      options.inspectionType === "return" &&
      newDamageCount > 0 &&
      !damageChargeAmount.trim()
    ) {
      setError(
        "New damage was found. Enter a damage penalty amount (use 0 to waive).",
      );
      setStep("signoff");
      return;
    }

    const formData = new FormData();
    formData.set("rental_id", options.rentalId);
    formData.set("inspection_type", options.inspectionType);
    formData.set("odometer", odometer);
    formData.set("fuel_level", fuelLevel);
    formData.set("cleanliness", cleanliness);
    formData.set("odor", odor);
    formData.set("notes", notes);
    formData.set("template_id", options.checklist.templateId);
    formData.set("customer_acknowledged", acknowledged ? "true" : "false");
    if (options.inspectionType === "return") {
      if (fuelChargeAmount) formData.set("fuel_charge_amount", fuelChargeAmount);
      if (fuelChargeNote) formData.set("fuel_charge_note", fuelChargeNote);
      if (damageChargeAmount !== "") {
        formData.set("damage_charge_amount", damageChargeAmount);
      }
      if (damageChargeNote) formData.set("damage_charge_note", damageChargeNote);
    }
    if (signature) formData.set("signature_data_url", signature);
    if (agreementDraft) {
      formData.set("agreement", "1");
      formData.set("agreement_accepted", agreementAccepted ? "true" : "false");
      formData.set("renter_address", renterAddress.trim());
      if (!agreementDraft.companySignatureUrl && companySignature) {
        formData.set("company_signature_data_url", companySignature);
      }
    }
    formData.set(
      "items",
      JSON.stringify(
        items.map((item) => ({
          area_code: item.areaCode,
          label: item.label,
          item_group: item.itemGroup,
          body_map_zone: item.bodyMapZone,
          status: item.status,
          severity: item.severity,
          notes: item.notes || null,
        })),
      ),
    );

    const flagged = new Set(
      items.filter((item) => isDamageStatus(item.status)).map((item) => item.areaCode),
    );
    const toUpload = [
      ...gallery.ready.map((entry) => ({ file: entry.file!, kind: "other" })),
      ...Object.entries(damageFiles)
        .filter(([areaCode, file]) => file && flagged.has(areaCode))
        .map(([areaCode, file]) => ({
          file: file!,
          kind: "damage_closeup",
          area_code: areaCode,
        })),
    ];

    let photos;
    try {
      photos = await uploadAll(toUpload);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload the photos and videos.",
      );
      return;
    }
    formData.set("photos", JSON.stringify(photos));

    startTransition(async () => {
      const result = await submitRentalInspectionAction(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      router.refresh();
      options.onDone();
    });
  }

  return {
    pending: submitting || uploadStatus !== null,
    uploadStatus,
    step,
    setStep,
    error,
    odometer,
    setOdometer,
    fuelLevel,
    setFuelLevel,
    cleanliness,
    setCleanliness,
    odor,
    setOdor,
    notes,
    setNotes,
    selectedZone,
    setSelectedZone,
    signature,
    setSignature,
    acknowledged,
    setAcknowledged,
    fuelChargeAmount,
    setFuelChargeAmount,
    fuelChargeNote,
    setFuelChargeNote,
    damageChargeAmount,
    setDamageChargeAmount,
    damageChargeNote,
    setDamageChargeNote,
    gallery,
    renterAddress,
    setRenterAddress,
    agreementAccepted,
    setAgreementAccepted,
    companySignature,
    setCompanySignature,
    damageFiles,
    setDamageFiles,
    items,
    bodyZones,
    newDamageCount,
    patchItem,
    validateSigning,
    submit,
  };
}
