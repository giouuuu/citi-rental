"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { vehicleDefinition } from "@/features/vehicles/schemas/vehicle-definition";
import {
  removeVehicleCover,
  removeVehicleShowcase,
  uploadVehiclePhoto,
} from "@/features/vehicles/lib/upload-vehicle-photo";
import { isVehicleRateLockedByBookings } from "@/features/vehicles/lib/vehicle-rate-lock";
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
    half_day_rate: formData.get("half_day_rate") || undefined,
    hourly_rate: formData.get("hourly_rate") || undefined,
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
  const showcase = formData.get("showcase_image");
  const showcaseFile =
    showcase instanceof File && showcase.size > 0 ? showcase : null;
  // "Remove" on a saved image; a newly chosen file replaces it instead.
  const removePhoto = !photoFile && formData.get("photo__remove") === "on";
  const removeShowcase =
    !showcaseFile && formData.get("showcase_image__remove") === "on";
  if (showcaseFile && !["image/png", "image/webp"].includes(showcaseFile.type)) {
    return {
      success: false,
      message: "The landing page image must be a PNG or WebP with a transparent background.",
      fieldErrors: {
        showcase_image: ["Use a PNG or WebP with a transparent background."],
      },
    };
  }
  const payload: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );
  // A cleared optional rate is saved as "none", not left as it was.
  payload.half_day_rate = parsed.data.half_day_rate ?? null;
  payload.hourly_rate = parsed.data.hourly_rate ?? null;

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
    if (profileError || !profile || !profile.is_active)
      throw new Error("Your profile is not active.");
    if (!isAdminRole(profile.role))
      throw new Error("Your role cannot modify vehicles.");

    let savedId = id;

    if (id) {
      const { data: current, error: currentError } = await supabase
        .from("vehicles")
        .select("daily_rate, status")
        .eq("id", id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current)
        throw new Error("The vehicle was not found.");

      const { data: occupancy, error: occupancyError } = await supabase
        .from("rentals")
        .select("status")
        .eq("vehicle_id", id)
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

      const updatePayload = rateLocked
        ? Object.fromEntries(
            Object.entries(payload).filter(([key]) => key !== "daily_rate"),
          )
        : payload;

      const { data, error } = await supabase
        .from("vehicles")
        .update(updatePayload)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The vehicle was not found.");
      savedId = data.id;
    } else {
      // Photos are not needed to rent a car from ops; the gallery only
      // decides whether it shows on the public site.
      const { data, error } = await supabase
        .from("vehicles")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      savedId = String(data.id);
    }

    if (photoFile && savedId) {
      const uploaded = await uploadVehiclePhoto({
        supabase,
        vehicleId: savedId,
        file: photoFile,
        kind: "front",
      });
      const { error: photoError } = await supabase
        .from("vehicles")
        .update({ photo_url: uploaded.publicUrl })
        .eq("id", savedId);
      if (photoError) throw photoError;

      const { error: galleryError } = await supabase.from("vehicle_photos").upsert(
        {
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

    if (showcaseFile && savedId) {
      const uploaded = await uploadVehiclePhoto({
        supabase,
        vehicleId: savedId,
        file: showcaseFile,
        kind: "showcase",
      });
      const { error: showcaseError } = await supabase
        .from("vehicles")
        .update({ showcase_image_url: uploaded.publicUrl })
        .eq("id", savedId);
      if (showcaseError) throw showcaseError;
    }

    if (removePhoto && savedId) {
      await removeVehicleCover({ supabase, vehicleId: savedId });
    }
    if (removeShowcase && savedId) {
      await removeVehicleShowcase({ supabase, vehicleId: savedId });
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
    return { success: false, message };
  }
}
