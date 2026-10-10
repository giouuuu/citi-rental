"use server";

import { createClient } from "@/lib/supabase/server";
import { mapRentalDbError } from "@/features/rentals/lib/booking-gates";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  MAX_GALLERY_ITEMS,
  isInspectionMediaPath,
} from "@/features/inspections/lib/inspection-media";

/**
 * Attach photos and videos to an inspection after it was submitted — the
 * ones that failed or were skipped at the handover. Allowed until the rental
 * is completed (enforced by add_rental_inspection_media).
 */
export async function addInspectionMediaAction(input: {
  rentalId: string;
  inspectionId: string;
  paths: string[];
}): Promise<ActionResult<{ added: number }>> {
  const { rentalId, inspectionId } = input;
  const paths = Array.isArray(input.paths) ? input.paths : [];
  if (paths.length === 0) {
    return { success: false, message: "Add at least one photo or video." };
  }
  if (paths.length > MAX_GALLERY_ITEMS) {
    return {
      success: false,
      message: `An inspection holds up to ${MAX_GALLERY_ITEMS} photos and videos.`,
    };
  }
  if (paths.some((path) => typeof path !== "string" || !isInspectionMediaPath(path, rentalId))) {
    return { success: false, message: "A photo or video path is invalid." };
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
      throw new Error("Your role cannot add inspection media.");
    }

    // The inspection must belong to the rental whose folder the files are in.
    const { data: inspection } = await supabase
      .from("rental_inspections")
      .select("id")
      .eq("id", inspectionId)
      .eq("rental_id", rentalId)
      .maybeSingle();
    if (!inspection) {
      return { success: false, message: "Inspection was not found." };
    }

    const { data, error } = await supabase.rpc("add_rental_inspection_media", {
      p_inspection_id: inspectionId,
      p_photos: paths.map((path) => ({ storage_path: path, kind: "other" })),
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return { success: true, data: { added: Number(data ?? paths.length) } };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}
