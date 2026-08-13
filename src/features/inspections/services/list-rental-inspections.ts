import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createInspectionSignedUrls } from "@/features/inspections/services/upload-inspection-photo";
import type {
  InspectionChecklist,
  InspectionCleanliness,
  InspectionItemStatus,
  InspectionOdor,
  InspectionPhotoKind,
  InspectionType,
  RentalInspection,
} from "@/features/inspections/types/inspection";

type InspectionRow = {
  id: string;
  rental_id: string;
  inspection_type: InspectionType;
  template_id: string | null;
  odometer: number | string;
  fuel_level: number | string;
  cleanliness: InspectionCleanliness;
  odor: InspectionOdor;
  notes: string | null;
  fuel_charge_amount: number | string | null;
  fuel_charge_note: string | null;
  damage_charge_amount: number | string | null;
  damage_charge_note: string | null;
  fuel_payment_id: string | null;
  damage_payment_id: string | null;
  customer_signature_path: string | null;
  customer_acknowledged_at: string | null;
  inspected_by: string | null;
  inspected_at: string;
  rental_inspection_items?: Array<{
    id: string;
    area_code: string;
    label: string;
    item_group: string;
    body_map_zone: string | null;
    status: InspectionItemStatus;
    severity: number | null;
    notes: string | null;
  }> | null;
  rental_inspection_photos?: Array<{
    id: string;
    storage_path: string;
    kind: InspectionPhotoKind;
    caption: string | null;
    item_id: string | null;
  }> | null;
};

function mapInspection(
  row: InspectionRow,
  signedUrls: Map<string, string>,
): RentalInspection {
  return {
    id: row.id,
    rentalId: row.rental_id,
    inspectionType: row.inspection_type,
    templateId: row.template_id,
    odometer: Number(row.odometer),
    fuelLevel: Number(row.fuel_level),
    cleanliness: row.cleanliness,
    odor: row.odor,
    notes: row.notes,
    fuelChargeAmount:
      row.fuel_charge_amount == null ? null : Number(row.fuel_charge_amount),
    fuelChargeNote: row.fuel_charge_note,
    damageChargeAmount:
      row.damage_charge_amount == null
        ? null
        : Number(row.damage_charge_amount),
    damageChargeNote: row.damage_charge_note,
    fuelPaymentId: row.fuel_payment_id,
    damagePaymentId: row.damage_payment_id,
    customerSignaturePath: row.customer_signature_path,
    customerAcknowledgedAt: row.customer_acknowledged_at,
    inspectedBy: row.inspected_by,
    inspectedAt: row.inspected_at,
    items: (row.rental_inspection_items ?? []).map((item) => ({
      id: item.id,
      areaCode: item.area_code,
      label: item.label,
      itemGroup: item.item_group,
      bodyMapZone: item.body_map_zone,
      status: item.status,
      severity: item.severity,
      notes: item.notes,
    })),
    photos: (row.rental_inspection_photos ?? []).map((photo) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      kind: photo.kind,
      caption: photo.caption,
      itemId: photo.item_id,
      signedUrl: signedUrls.get(photo.storage_path) ?? null,
    })),
  };
}

export async function listRentalInspections(
  rentalId: string,
): Promise<RentalInspection[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rental_inspections")
    .select(
      `
      id,
      rental_id,
      inspection_type,
      template_id,
      odometer,
      fuel_level,
      cleanliness,
      odor,
      notes,
      fuel_charge_amount,
      fuel_charge_note,
      damage_charge_amount,
      damage_charge_note,
      fuel_payment_id,
      damage_payment_id,
      customer_signature_path,
      customer_acknowledged_at,
      inspected_by,
      inspected_at,
      rental_inspection_items (
        id, area_code, label, item_group, body_map_zone, status, severity, notes
      ),
      rental_inspection_photos (
        id, storage_path, kind, caption, item_id
      )
    `,
    )
    .eq("rental_id", rentalId)
    .order("inspected_at", { ascending: true });

  if (error) {
    console.error("listRentalInspections failed", error.message);
    return [];
  }

  const rows = (data ?? []) as InspectionRow[];
  const paths = rows.flatMap((row) =>
    (row.rental_inspection_photos ?? []).map((photo) => photo.storage_path),
  );
  const signedUrls = await createInspectionSignedUrls(supabase, paths);
  return rows.map((row) => mapInspection(row, signedUrls));
}

export async function getInspectionChecklistForRental(
  rentalId: string,
): Promise<InspectionChecklist | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_inspection_checklist_for_rental",
    { p_rental_id: rentalId },
  );
  if (error) {
    console.error("get_inspection_checklist_for_rental failed", error.message);
    return null;
  }

  const payload = data as {
    template_id: string;
    name: string;
    vehicle_category: string | null;
    items: Array<{
      area_code: string;
      label: string;
      item_group: string;
      body_map_zone: string | null;
      sort_order: number;
      is_required: boolean;
    }>;
  };

  return {
    templateId: payload.template_id,
    name: payload.name,
    vehicleCategory: payload.vehicle_category,
    items: (payload.items ?? []).map((item) => ({
      areaCode: item.area_code,
      label: item.label,
      itemGroup: item.item_group,
      bodyMapZone: item.body_map_zone,
      sortOrder: item.sort_order,
      isRequired: item.is_required,
    })),
  };
}
