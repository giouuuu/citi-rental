import type {
  InspectionCleanliness,
  InspectionItemStatus,
  InspectionOdor,
  InspectionPhotoKind,
} from "@/features/inspections/types/inspection";

export const INSPECTION_ITEM_STATUSES: {
  value: InspectionItemStatus;
  label: string;
}[] = [
  { value: "ok", label: "OK" },
  { value: "scratch", label: "Scratch" },
  { value: "dent", label: "Dent" },
  { value: "chip", label: "Chip" },
  { value: "crack", label: "Crack" },
  { value: "missing", label: "Missing" },
  { value: "dirty", label: "Dirty" },
  { value: "damaged", label: "Damaged" },
  { value: "other", label: "Other" },
];

export const INSPECTION_CLEANLINESS: {
  value: InspectionCleanliness;
  label: string;
}[] = [
  { value: "clean", label: "Clean" },
  { value: "acceptable", label: "Acceptable" },
  { value: "dirty", label: "Dirty" },
  { value: "needs_detailing", label: "Needs detailing" },
];

export const INSPECTION_ODORS: { value: InspectionOdor; label: string }[] = [
  { value: "none", label: "None" },
  { value: "smoke", label: "Smoke" },
  { value: "strong", label: "Strong odor" },
  { value: "other", label: "Other" },
];

/** Required overview angles for every pickup and return inspection. */
export const REQUIRED_OVERVIEW_PHOTO_KINDS: {
  value: InspectionPhotoKind;
  label: string;
}[] = [
  { value: "overview_front", label: "Front" },
  { value: "overview_rear", label: "Rear" },
  { value: "overview_left", label: "Left side" },
  { value: "overview_right", label: "Right side" },
  { value: "overview_interior", label: "Interior" },
  { value: "overview_dashboard", label: "Dashboard" },
];

/** Extra optional slots shown on the photos step. */
export const OPTIONAL_OVERVIEW_PHOTO_KINDS: {
  value: InspectionPhotoKind;
  label: string;
}[] = [
  { value: "odometer", label: "Odometer" },
  { value: "fuel_gauge", label: "Fuel gauge" },
];

export const OVERVIEW_PHOTO_KINDS = [
  ...REQUIRED_OVERVIEW_PHOTO_KINDS,
  ...OPTIONAL_OVERVIEW_PHOTO_KINDS,
];

export const ITEM_GROUP_LABELS: Record<string, string> = {
  exterior: "Exterior / paint",
  glass_lights: "Glass & lights",
  wheels: "Wheels & tires",
  interior: "Interior",
  accessories: "Accessories & docs",
};

export function statusLabel(status: InspectionItemStatus): string {
  return (
    INSPECTION_ITEM_STATUSES.find((entry) => entry.value === status)?.label ??
    status
  );
}

export function isDamageStatus(status: InspectionItemStatus): boolean {
  return status !== "ok";
}

export function photoKindLabel(kind: InspectionPhotoKind | string): string {
  return (
    OVERVIEW_PHOTO_KINDS.find((entry) => entry.value === kind)?.label ??
    kind.replaceAll("_", " ")
  );
}
