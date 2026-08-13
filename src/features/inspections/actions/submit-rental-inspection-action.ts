"use server";

import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { mapRentalDbError } from "@/features/rentals/lib/booking-gates";
import { submitInspectionSchema } from "@/features/inspections/schemas/submit-inspection-schema";
import {
  uploadInspectionPhoto,
  uploadInspectionPhotoFromDataUrl,
} from "@/features/inspections/services/upload-inspection-photo";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function submitRentalInspectionAction(
  formData: FormData,
): Promise<ActionResult<{ inspectionId: string }>> {
  const items = parseJsonField(formData.get("items"), []);
  const photosMeta = parseJsonField<
    Array<{
      kind: string;
      area_code?: string | null;
      caption?: string | null;
      field?: string;
    }>
  >(formData.get("photos_meta"), []);

  const parsed = submitInspectionSchema.safeParse({
    rental_id: formData.get("rental_id"),
    inspection_type: formData.get("inspection_type"),
    odometer: formData.get("odometer"),
    fuel_level: formData.get("fuel_level"),
    cleanliness: formData.get("cleanliness"),
    odor: formData.get("odor"),
    notes: formData.get("notes") || undefined,
    template_id: formData.get("template_id") || undefined,
    customer_acknowledged: formData.get("customer_acknowledged") === "true",
    fuel_charge_amount: formData.get("fuel_charge_amount") || undefined,
    fuel_charge_note: formData.get("fuel_charge_note") || undefined,
    damage_charge_amount: formData.get("damage_charge_amount") || undefined,
    damage_charge_note: formData.get("damage_charge_note") || undefined,
    items,
    photos: [],
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "The inspection data is invalid.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) {
      throw new Error("Your profile is not active for this organization.");
    }
    if (!isStaffRole(profile.role)) {
      throw new Error("Your role cannot submit inspections.");
    }

    const uploadedPhotos: Array<{
      storage_path: string;
      kind: string;
      area_code?: string | null;
      caption?: string | null;
    }> = [];

    for (const meta of photosMeta) {
      const field = meta.field ?? meta.kind;
      const file = formData.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      const path = await uploadInspectionPhoto({
        supabase,
        organizationId: profile.organization_id,
        rentalId: parsed.data.rental_id,
        file,
        kind: meta.kind,
      });
      uploadedPhotos.push({
        storage_path: path,
        kind: meta.kind,
        area_code: meta.area_code,
        caption: meta.caption,
      });
    }

    const signatureDataUrl = formData.get("signature_data_url");
    let signaturePath = parsed.data.customer_signature_path ?? null;
    if (typeof signatureDataUrl === "string" && signatureDataUrl.startsWith("data:")) {
      signaturePath = await uploadInspectionPhotoFromDataUrl({
        supabase,
        organizationId: profile.organization_id,
        rentalId: parsed.data.rental_id,
        dataUrl: signatureDataUrl,
        kind: "signature",
      });
      uploadedPhotos.push({
        storage_path: signaturePath,
        kind: "signature",
      });
    }

    const damagedWithoutPhoto = parsed.data.items.some((item) => {
      if (item.status === "ok") return false;
      return !uploadedPhotos.some(
        (photo) =>
          photo.kind === "damage_closeup" && photo.area_code === item.area_code,
      );
    });
    if (damagedWithoutPhoto) {
      return {
        success: false,
        message: "Add a close-up photo for every damaged checklist item.",
      };
    }

    const overviewKinds = [
      "overview_front",
      "overview_rear",
      "overview_left",
      "overview_right",
      "overview_interior",
      "overview_dashboard",
    ];
    const missingOverview = overviewKinds.some(
      (kind) => !uploadedPhotos.some((photo) => photo.kind === kind),
    );
    if (missingOverview) {
      return {
        success: false,
        message:
          "Upload front, rear, left, right, interior, and dashboard photos.",
      };
    }

    const { data, error } = await supabase.rpc("submit_rental_inspection", {
      p_rental_id: parsed.data.rental_id,
      p_inspection_type: parsed.data.inspection_type,
      p_odometer: parsed.data.odometer,
      p_fuel_level: parsed.data.fuel_level,
      p_cleanliness: parsed.data.cleanliness,
      p_odor: parsed.data.odor,
      p_notes: parsed.data.notes ?? null,
      p_items: parsed.data.items,
      p_photos: uploadedPhotos,
      p_customer_signature_path: signaturePath,
      p_customer_acknowledged: parsed.data.customer_acknowledged ?? false,
      p_fuel_charge_amount: parsed.data.fuel_charge_amount ?? null,
      p_fuel_charge_note: parsed.data.fuel_charge_note ?? null,
      p_damage_charge_amount: parsed.data.damage_charge_amount ?? null,
      p_damage_charge_note: parsed.data.damage_charge_note ?? null,
      p_template_id: parsed.data.template_id ?? null,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return {
      success: true,
      data: { inspectionId: data as string },
    };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}

export async function resolveVehicleKnownDamageAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { success: false, message: "Damage record id is required." };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active || !isStaffRole(profile.role)) {
      throw new Error("Your role cannot update known damage.");
    }

    const { error } = await supabase
      .from("vehicle_known_damages")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", id)
      .eq("organization_id", profile.organization_id);
    if (error) throw error;
    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}

export async function cloneInspectionTemplateAction(
  formData: FormData,
): Promise<ActionResult<{ templateId: string }>> {
  const category = String(formData.get("vehicle_category") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!category) {
    return { success: false, message: "Vehicle category is required." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "clone_inspection_template_for_category",
      {
        p_vehicle_category: category,
        p_name: name || null,
      },
    );
    if (error) throw error;
    revalidateResource("/rentals");
    return { success: true, data: { templateId: data as string } };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}
