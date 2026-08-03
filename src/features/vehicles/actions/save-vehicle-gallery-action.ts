"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  VEHICLE_GALLERY_KINDS,
  type VehiclePhotoKind,
} from "@/features/vehicles/lib/vehicle-gallery";
import { uploadVehiclePhoto } from "@/features/vehicles/lib/upload-vehicle-photo";

const KIND_SET = new Set<string>(VEHICLE_GALLERY_KINDS.map((slot) => slot.value));

export async function saveVehicleGalleryAction(
  formData: FormData,
): Promise<ActionResult<{ uploaded: string[] }>> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to upload vehicle photos.",
    };
  }

  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) {
    return { success: false, message: "Vehicle id is required." };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile?.is_active) {
      throw new Error("Your profile is not active for this organization.");
    }
    if (!isAdminRole(profile.role)) {
      throw new Error("Your role cannot modify vehicle photos.");
    }

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, status")
      .eq("id", vehicleId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw new Error("The vehicle was not found in your organization.");

    const uploaded: string[] = [];

    for (const slot of VEHICLE_GALLERY_KINDS) {
      const file = formData.get(`gallery_${slot.value}`);
      if (!(file instanceof File) || file.size === 0) continue;
      if (!KIND_SET.has(slot.value)) continue;

      const kind = slot.value as VehiclePhotoKind;
      const { path, publicUrl } = await uploadVehiclePhoto({
        supabase,
        organizationId: profile.organization_id,
        vehicleId,
        file,
        kind,
      });

      const { error: upsertError } = await supabase.from("vehicle_photos").upsert(
        {
          organization_id: profile.organization_id,
          vehicle_id: vehicleId,
          kind,
          storage_path: path,
          public_url: publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vehicle_id,kind" },
      );
      if (upsertError) throw upsertError;

      if (kind === "front") {
        const { error: coverError } = await supabase
          .from("vehicles")
          .update({ photo_url: publicUrl })
          .eq("id", vehicleId)
          .eq("organization_id", profile.organization_id);
        if (coverError) throw coverError;
      }

      uploaded.push(kind);
    }

    if (uploaded.length === 0) {
      return {
        success: false,
        message: "Choose at least one gallery photo to upload.",
      };
    }

    return { success: true, data: { uploaded } };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The vehicle gallery could not be saved.",
    };
  }
}
