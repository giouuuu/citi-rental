"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import {
  VEHICLE_GALLERY_KINDS,
  type VehiclePhotoKind,
} from "@/features/vehicles/lib/vehicle-gallery";
import { removeVehicleGalleryPhoto } from "@/features/vehicles/lib/upload-vehicle-photo";

const KIND_SET = new Set<string>(VEHICLE_GALLERY_KINDS.map((slot) => slot.value));

export async function removeVehicleGalleryPhotoAction(
  vehicleId: string,
  kind: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to remove vehicle photos.",
    };
  }
  if (!vehicleId) return { success: false, message: "Vehicle id is required." };
  if (!KIND_SET.has(kind)) {
    return { success: false, message: "That is not a gallery photo slot." };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile?.is_active) {
      throw new Error("Your profile is not active.");
    }
    if (!isAdminRole(profile.role)) {
      throw new Error("Your role cannot modify vehicle photos.");
    }

    const removed = await removeVehicleGalleryPhoto({
      supabase,
      vehicleId,
      kind: kind as VehiclePhotoKind,
    });
    if (!removed) throw new Error("That photo was already removed.");

    revalidateResource("/vehicles");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "The photo could not be removed.",
    };
  }
}
