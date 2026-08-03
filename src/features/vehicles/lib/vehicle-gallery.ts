export const VEHICLE_GALLERY_KINDS = [
  { value: "front", label: "Front" },
  { value: "rear", label: "Rear" },
  { value: "left", label: "Left side" },
  { value: "right", label: "Right side" },
  { value: "interior", label: "Interior" },
  { value: "dashboard", label: "Dashboard" },
] as const;

export type VehiclePhotoKind = (typeof VEHICLE_GALLERY_KINDS)[number]["value"];

export type VehiclePhoto = {
  id: string;
  vehicleId: string;
  kind: VehiclePhotoKind;
  storagePath: string;
  publicUrl: string;
};

export function isCompleteVehicleGallery(
  photos: Array<{ kind: string }>,
): boolean {
  const present = new Set(photos.map((photo) => photo.kind));
  return VEHICLE_GALLERY_KINDS.every((slot) => present.has(slot.value));
}

export function missingVehicleGalleryLabels(
  photos: Array<{ kind: string }>,
): string[] {
  const present = new Set(photos.map((photo) => photo.kind));
  return VEHICLE_GALLERY_KINDS.filter((slot) => !present.has(slot.value)).map(
    (slot) => slot.label,
  );
}
