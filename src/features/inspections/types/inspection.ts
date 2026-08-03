export type InspectionType = "pickup" | "return";

export type InspectionItemStatus =
  | "ok"
  | "scratch"
  | "dent"
  | "chip"
  | "crack"
  | "missing"
  | "dirty"
  | "damaged"
  | "other";

export type InspectionPhotoKind =
  | "overview_front"
  | "overview_rear"
  | "overview_left"
  | "overview_right"
  | "overview_interior"
  | "overview_dashboard"
  | "odometer"
  | "fuel_gauge"
  | "damage_closeup"
  | "signature"
  | "other";

export type InspectionCleanliness =
  | "clean"
  | "acceptable"
  | "dirty"
  | "needs_detailing";

export type InspectionOdor = "none" | "smoke" | "strong" | "other";

export type ChecklistItemDef = {
  areaCode: string;
  label: string;
  itemGroup: string;
  bodyMapZone: string | null;
  sortOrder: number;
  isRequired: boolean;
};

export type InspectionChecklist = {
  templateId: string;
  name: string;
  vehicleCategory: string | null;
  items: ChecklistItemDef[];
};

export type InspectionItem = {
  id: string;
  areaCode: string;
  label: string;
  itemGroup: string;
  bodyMapZone: string | null;
  status: InspectionItemStatus;
  severity: number | null;
  notes: string | null;
};

export type InspectionPhoto = {
  id: string;
  storagePath: string;
  kind: InspectionPhotoKind;
  caption: string | null;
  itemId: string | null;
  signedUrl?: string | null;
};

export type RentalInspection = {
  id: string;
  rentalId: string;
  inspectionType: InspectionType;
  templateId: string | null;
  odometer: number;
  fuelLevel: number;
  cleanliness: InspectionCleanliness;
  odor: InspectionOdor;
  notes: string | null;
  fuelChargeAmount: number | null;
  fuelChargeNote: string | null;
  damageChargeAmount: number | null;
  damageChargeNote: string | null;
  customerSignaturePath: string | null;
  customerAcknowledgedAt: string | null;
  inspectedBy: string | null;
  inspectedAt: string;
  items: InspectionItem[];
  photos: InspectionPhoto[];
};

export type VehicleKnownDamage = {
  id: string;
  vehicleId: string;
  areaCode: string;
  label: string;
  status: InspectionItemStatus;
  severity: number | null;
  notes: string | null;
  photoPath: string | null;
  sourceInspectionId: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
};

export type ConditionDelta = {
  areaCode: string;
  label: string;
  pickupStatus: InspectionItemStatus | null;
  returnStatus: InspectionItemStatus | null;
  pickupSeverity: number | null;
  returnSeverity: number | null;
  isNewDamage: boolean;
};
