"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/types/resource";
import { vehicleDefinition } from "@/features/vehicles/schemas/vehicle-definition";

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
    current_odometer: formData.get("current_odometer") || undefined,
    status: formData.get("status") ?? undefined,
    photo_url: formData.get("photo_url") || undefined,
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
    if (profile.role !== "administrator")
      throw new Error("Your role cannot modify vehicles.");

    if (id) {
      const { data, error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The vehicle was not found in your organization.");
      return { success: true, data: { id, href: `${vehicleDefinition.route}/${id}` } };
    }

    const { data, error } = await supabase
      .from("vehicles")
      .insert({ ...payload, organization_id: profile.organization_id })
      .select("id")
      .single();
    if (error) throw error;
    const savedId = String(data.id);
    return {
      success: true,
      data: { id: savedId, href: `${vehicleDefinition.route}/${savedId}` },
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
