"use server";

import { createClient } from "@/lib/supabase/server";
import {
  AGREEMENT_TEMPLATE_VERSION,
  buildAgreementTerms,
} from "@/features/agreements/lib/agreement-template";
import { getAgreementCompany } from "@/features/agreements/services/get-agreement-draft";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { mapRentalDbError } from "@/features/rentals/lib/booking-gates";
import { submitInspectionSchema } from "@/features/inspections/schemas/submit-inspection-schema";
import {
  MAX_GALLERY_ITEMS,
  isInspectionMediaPath,
} from "@/features/inspections/lib/inspection-media";
import { uploadInspectionPhotoFromDataUrl } from "@/features/inspections/services/upload-inspection-photo";
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
  // Photos and videos are compressed and uploaded by the browser; only their
  // storage paths arrive here.
  const photos = parseJsonField(formData.get("photos"), []);

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
    photos,
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
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) {
      throw new Error("Your profile is not active.");
    }
    if (!isStaffRole(profile.role)) {
      throw new Error("Your role cannot submit inspections.");
    }

    const rentalId = parsed.data.rental_id;
    if (
      parsed.data.photos.some(
        (photo) =>
          photo.kind === "signature" ||
          !isInspectionMediaPath(photo.storage_path, rentalId),
      )
    ) {
      return { success: false, message: "A photo or video path is invalid." };
    }

    const uploadedPhotos: Array<{
      storage_path: string;
      kind: string;
      area_code?: string | null;
      caption?: string | null;
    }> = [...parsed.data.photos];

    // Release: the renter signs the rental agreement with the condition report.
    const releasing = parsed.data.inspection_type === "pickup";
    const renterAddress = String(formData.get("renter_address") ?? "").trim();
    if (releasing) {
      const agreementError =
        formData.get("agreement") !== "1"
          ? "Have the renter sign the rental agreement before releasing the car."
          : !renterAddress
            ? "Enter the renter's address for the rental agreement."
            : renterAddress.length > 300
              ? "Keep the renter's address under 300 characters."
              : formData.get("agreement_accepted") !== "true"
                ? "Confirm the renter agrees to the rental agreement."
                : null;
      if (agreementError) return { success: false, message: agreementError };
    }

    const signatureDataUrl = formData.get("signature_data_url");
    let signaturePath = parsed.data.customer_signature_path ?? null;
    if (typeof signatureDataUrl === "string" && signatureDataUrl.startsWith("data:")) {
      signaturePath = await uploadInspectionPhotoFromDataUrl({
        supabase,
        rentalId: parsed.data.rental_id,
        dataUrl: signatureDataUrl,
        kind: "signature",
      });
      uploadedPhotos.push({
        storage_path: signaturePath,
        kind: "signature",
      });
    }

    let agreement: Record<string, unknown> | null = null;
    if (releasing) {
      if (!signaturePath) {
        return {
          success: false,
          message: "The renter must sign the rental agreement.",
        };
      }
      const company = await getAgreementCompany();
      let companySignaturePath = company.signaturePath;
      const companySignatureDataUrl = formData.get("company_signature_data_url");
      if (
        !companySignaturePath &&
        typeof companySignatureDataUrl === "string" &&
        companySignatureDataUrl.startsWith("data:")
      ) {
        companySignaturePath = await uploadInspectionPhotoFromDataUrl({
          supabase,
          rentalId,
          dataUrl: companySignatureDataUrl,
          kind: "company-signature",
        });
      }
      if (!companySignaturePath) {
        return {
          success: false,
          message: "Add the company signature to the rental agreement.",
        };
      }
      // Terms are built here, not taken from the browser, so what is signed
      // is always the current template.
      agreement = {
        template_version: AGREEMENT_TEMPLATE_VERSION,
        terms: buildAgreementTerms({
          freeCancellationHours: company.freeCancellationHours,
        }),
        renter_address: renterAddress,
        accepted: true,
        company_signature_path: companySignaturePath,
      };
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

    const galleryCount = uploadedPhotos.filter(
      (photo) => photo.kind !== "signature" && photo.kind !== "damage_closeup",
    ).length;
    if (galleryCount === 0) {
      return {
        success: false,
        message: "Add at least one photo or video of the car.",
      };
    }
    if (galleryCount > MAX_GALLERY_ITEMS) {
      return {
        success: false,
        message: `An inspection holds up to ${MAX_GALLERY_ITEMS} photos and videos.`,
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
      p_agreement: agreement,
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
      .select("role, is_active")
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
      .eq("id", id);
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
