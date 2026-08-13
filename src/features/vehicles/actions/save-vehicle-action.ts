"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { vehicleDefinition } from "@/features/vehicles/schemas/vehicle-definition";
import { uploadVehiclePhoto } from "@/features/vehicles/lib/upload-vehicle-photo";
import { isVehicleRateLockedByBookings } from "@/features/vehicles/lib/vehicle-rate-lock";
import {
  isCompleteVehicleGallery,
  missingVehicleGalleryLabels,
} from "@/features/vehicles/lib/vehicle-gallery";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function saveVehicleAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to create or update vehicles.",
    };
  }

  const values = {
    plate_number: formData.get("plate_number") ?? undefined,
    name: formData.get("name") ?? undefined,
    make: formData.get("make") ?? undefined,
    model: formData.get("model") ?? undefined,
    year: formData.get("year") ?? undefined,
    color: formData.get("color") || undefined,
    category: formData.get("category") || undefined,
    transmission: formData.get("transmission") || undefined,
    fuel_type: formData.get("fuel_type") || undefined,
    seating_capacity: formData.get("seating_capacity") || undefined,
    daily_rate: formData.get("daily_rate") ?? undefined,
    current_odometer: formData.get("current_odometer") || undefined,
    status: formData.get("status") ?? undefined,
    notes: formData.get("notes") || undefined,
  };
  const parsed = vehicleDefinition.schema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted vehicle fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const idValue = formData.get("__id");
  const id = typeof idValue === "string" && idValue ? idValue : undefined;
  const photo = formData.get("photo");
  const photoFile = photo instanceof File && photo.size > 0 ? photo : null;
  const payload = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );

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
    if (profileError || !profile || !profile.is_active)
      throw new Error("Your profile is not active for this organization.");
    if (!isAdminRole(profile.role))
      throw new Error("Your role cannot modify vehicles.");

    let savedId = id;
    const requestedStatus = parsed.data.status;

    if (id) {
      const { data: current, error: currentError } = await supabase
        .from("vehicles")
        .select("daily_rate, status")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current)
        throw new Error("The vehicle was not found in your organization.");

      const { data: occupancy, error: occupancyError } = await supabase
        .from("rentals")
        .select("status")
        .eq("vehicle_id", id)
        .eq("organization_id", profile.organization_id)
        .in("status", ["reserved", "active", "overdue"]);
      if (occupancyError) throw occupancyError;

      const rateLocked = isVehicleRateLockedByBookings(
        (occupancy ?? []).map((row) => String(row.status)),
      );
      if (
        rateLocked &&
        payload.daily_rate !== undefined &&
        Number(payload.daily_rate) !== Number(current.daily_rate)
      ) {
        return {
          success: false,
          message:
            "Daily rate cannot be changed while this vehicle has an active or reserved booking.",
          fieldErrors: {
            daily_rate: [
              "Daily rate cannot be changed while this vehicle has an active or reserved booking.",
            ],
          },
        };
      }

      if (
        requestedStatus === "available" &&
        current.status !== "available"
      ) {
        const { data: gallery } = await supabase
          .from("vehicle_photos")
          .select("kind")
          .eq("vehicle_id", id)
          .eq("organization_id", profile.organization_id);
        if (!isCompleteVehicleGallery(gallery ?? [])) {
          const missing = missingVehicleGalleryLabels(gallery ?? []);
          return {
            success: false,
            message: `Upload all 6 required photos before setting status to available. Missing: ${missing.join(", ")}.`,
            fieldErrors: {
              status: [
                `Upload the gallery first. Missing: ${missing.join(", ")}.`,
              ],
            },
          };
        }
      }

      const updatePayload = rateLocked
        ? Object.fromEntries(
            Object.entries(payload).filter(([key]) => key !== "daily_rate"),
          )
        : payload;

      const { data, error } = await supabase
        .from("vehicles")
        .update(updatePayload)
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The vehicle was not found in your organization.");
      savedId = data.id;
    } else {
      // New vehicles cannot be Available until the 6-photo gallery is complete.
      const createStatus =
        requestedStatus === "available" ? "maintenance" : requestedStatus;
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          ...payload,
          status: createStatus,
          organization_id: profile.organization_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      savedId = String(data.id);
    }

    if (photoFile && savedId) {
      const uploaded = await uploadVehiclePhoto({
        supabase,
        organizationId: profile.organization_id,
        vehicleId: savedId,
        file: photoFile,
        kind: "front",
      });
      const { error: photoError } = await supabase
        .from("vehicles")
        .update({ photo_url: uploaded.publicUrl })
        .eq("id", savedId)
        .eq("organization_id", profile.organization_id);
      if (photoError) throw photoError;

      const { error: galleryError } = await supabase.from("vehicle_photos").upsert(
        {
          organization_id: profile.organization_id,
          vehicle_id: savedId,
          kind: "front",
          storage_path: uploaded.path,
          public_url: uploaded.publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vehicle_id,kind" },
      );
      if (galleryError) throw galleryError;
    }

    revalidateResource("/vehicles");
    return {
      success: true,
      data: {
        id: String(savedId),
        href: `${vehicleDefinition.route}/${savedId}`,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The vehicle could not be saved.";
    if (message.includes("duplicate key"))
      return {
        success: false,
        message: "A vehicle with that unique value already exists.",
      };
    if (message.includes("foreign key"))
      return {
        success: false,
        message: "This vehicle is still linked to another active record.",
      };
    if (message.includes("6 required vehicle photos")) {
      return { success: false, message };
    }
    return { success: false, message };
  }
}
