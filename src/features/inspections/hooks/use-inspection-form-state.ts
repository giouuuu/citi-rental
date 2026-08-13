"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ChecklistDraftItem } from "@/features/inspections/components/inspection-checklist-panel";
import {
  REQUIRED_OVERVIEW_PHOTO_KINDS,
  isDamageStatus,
} from "@/features/inspections/lib/checklist-areas";
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
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<InspectionFormStep>("readings");
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
  const [overviewFiles, setOverviewFiles] = useState<Record<string, File | null>>(
    {},
  );
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

  function submit() {
    setError("");
    for (const item of items.filter((entry) => isDamageStatus(entry.status))) {
      if (!damageFiles[item.areaCode]) {
        setError(`Add a close-up photo for ${item.label}.`);
        setStep("photos");
        return;
      }
    }
    for (const kind of REQUIRED_OVERVIEW_PHOTO_KINDS) {
      if (!overviewFiles[kind.value]) {
        setError(`Upload the ${kind.label.toLowerCase()} photo.`);
        setStep("photos");
        return;
      }
    }
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

    const photosMeta: Array<{ kind: string; field: string; area_code?: string }> =
      [];
    for (const [kind, file] of Object.entries(overviewFiles)) {
      if (!file) continue;
      const field = `file_${kind}`;
      formData.set(field, file);
      photosMeta.push({ kind, field });
    }
    for (const [areaCode, file] of Object.entries(damageFiles)) {
      if (!file) continue;
      const field = `damage_${areaCode}`;
      formData.set(field, file);
      photosMeta.push({ kind: "damage_closeup", field, area_code: areaCode });
    }
    formData.set("photos_meta", JSON.stringify(photosMeta));

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
    pending,
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
    overviewFiles,
    setOverviewFiles,
    damageFiles,
    setDamageFiles,
    items,
    bodyZones,
    newDamageCount,
    patchItem,
    submit,
  };
}
