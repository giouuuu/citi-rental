import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createInspectionSignedUrls } from "@/features/inspections/services/upload-inspection-photo";
import type {
  InspectionCleanliness,
  InspectionItemStatus,
  InspectionOdor,
  InspectionPhotoKind,
  InspectionType,
  RentalInspection,
} from "@/features/inspections/types/inspection";

export type CustomerConditionReport = {
  rental: {
    id: string;
    referenceNumber: string;
    status: string;
    startAt: string;
    expectedReturnAt: string;
    actualReturnAt: string | null;
    startingOdometer: number | null;
    endingOdometer: number | null;
    startingFuelLevel: number | null;
    endingFuelLevel: number | null;
  };
  vehicle: {
    id: string;
    name: string | null;
    make: string | null;
    model: string | null;
    plateNumber: string | null;
    photoUrl: string | null;
  };
  inspections: RentalInspection[];
};

export async function getMyBookingConditionReport(
  rentalId: string,
): Promise<CustomerConditionReport | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_my_booking_condition_report",
    { p_rental_id: rentalId },
  );
  if (error) {
    console.error("get_my_booking_condition_report failed", error.message);
    return null;
  }

  const payload = data as {
    rental: {
      id: string;
      reference_number: string;
      status: string;
      start_at: string;
      expected_return_at: string;
      actual_return_at: string | null;
      starting_odometer: number | string | null;
      ending_odometer: number | string | null;
      starting_fuel_level: number | string | null;
      ending_fuel_level: number | string | null;
    };
    vehicle: {
      id: string;
      name: string | null;
      make: string | null;
      model: string | null;
      plate_number: string | null;
      photo_url: string | null;
    };
    inspections: Array<{
      id: string;
      inspection_type: InspectionType;
      odometer: number | string;
      fuel_level: number | string;
      cleanliness: InspectionCleanliness;
      odor: InspectionOdor;
      notes: string | null;
      customer_acknowledged_at: string | null;
      inspected_at: string;
      items: Array<{
        area_code: string;
        label: string;
        item_group: string;
        status: InspectionItemStatus;
        severity: number | null;
        notes: string | null;
      }>;
      photos: Array<{
        storage_path: string;
        kind: InspectionPhotoKind;
        caption: string | null;
      }>;
    }>;
  };

  const paths = (payload.inspections ?? []).flatMap((inspection) =>
    (inspection.photos ?? []).map((photo) => photo.storage_path),
  );
  const signedUrls = await createInspectionSignedUrls(supabase, paths);

  return {
    rental: {
      id: payload.rental.id,
      referenceNumber: payload.rental.reference_number,
      status: payload.rental.status,
      startAt: payload.rental.start_at,
      expectedReturnAt: payload.rental.expected_return_at,
      actualReturnAt: payload.rental.actual_return_at,
      startingOdometer:
        payload.rental.starting_odometer == null
          ? null
          : Number(payload.rental.starting_odometer),
      endingOdometer:
        payload.rental.ending_odometer == null
          ? null
          : Number(payload.rental.ending_odometer),
      startingFuelLevel:
        payload.rental.starting_fuel_level == null
          ? null
          : Number(payload.rental.starting_fuel_level),
      endingFuelLevel:
        payload.rental.ending_fuel_level == null
          ? null
          : Number(payload.rental.ending_fuel_level),
    },
    vehicle: {
      id: payload.vehicle.id,
      name: payload.vehicle.name,
      make: payload.vehicle.make,
      model: payload.vehicle.model,
      plateNumber: payload.vehicle.plate_number,
      photoUrl: payload.vehicle.photo_url,
    },
    inspections: (payload.inspections ?? []).map((inspection) => ({
      id: inspection.id,
      rentalId,
      inspectionType: inspection.inspection_type,
      templateId: null,
      odometer: Number(inspection.odometer),
      fuelLevel: Number(inspection.fuel_level),
      cleanliness: inspection.cleanliness,
      odor: inspection.odor,
      notes: inspection.notes,
      fuelChargeAmount: null,
      fuelChargeNote: null,
      damageChargeAmount: null,
      damageChargeNote: null,
      fuelPaymentId: null,
      damagePaymentId: null,
      customerSignaturePath: null,
      customerAcknowledgedAt: inspection.customer_acknowledged_at,
      inspectedBy: null,
      inspectedAt: inspection.inspected_at,
      items: (inspection.items ?? []).map((item, index) => ({
        id: `${inspection.id}-${item.area_code}-${index}`,
        areaCode: item.area_code,
        label: item.label,
        itemGroup: item.item_group,
        bodyMapZone: null,
        status: item.status,
        severity: item.severity,
        notes: item.notes,
      })),
      photos: (inspection.photos ?? []).map((photo, index) => ({
        id: `${inspection.id}-photo-${index}`,
        storagePath: photo.storage_path,
        kind: photo.kind,
        caption: photo.caption,
        itemId: null,
        signedUrl: signedUrls.get(photo.storage_path) ?? null,
      })),
    })),
  };
}
