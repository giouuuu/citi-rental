"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { deviceDefinition } from "@/features/devices/schemas/device-definition";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
export async function saveDeviceAction(formData: FormData): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to create or update GPS devices." };
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const values = Object.fromEntries(deviceDefinition.fields.filter((field) => field.name !== "vehicle_id").map((field) => {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") return [field.name, raw === "on"];
    return [field.name, raw === null || raw === "" ? undefined : raw];
  }));
  const parsed = deviceDefinition.schema.safeParse({ ...values, vehicle_id: vehicleId || undefined });
  if (!parsed.success) return { success: false, message: "Review the highlighted device fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!isAdminRole(profile.role)) throw new Error("Your role cannot modify GPS devices.");
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => key !== "vehicle_id" && value !== undefined));
    let savedId: string;
    if (id) {
      const { data, error } = await supabase.from("gps_devices").update(payload).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The GPS device was not found in your organization.");
      savedId = id;
    } else {
      const { data, error } = await supabase.from("gps_devices").insert({ ...payload, organization_id: profile.organization_id }).select("id").single();
      if (error) throw error;
      savedId = String(data.id);
    }
    const { error: assignmentError } = await supabase.rpc("assign_gps_device", { p_device_id: savedId, p_vehicle_id: vehicleId || null });
    if (assignmentError) throw assignmentError;
    revalidateResource(deviceDefinition.route);
    return { success: true, data: { id: savedId, href: `${deviceDefinition.route}/${savedId}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The GPS device could not be saved.";
    return { success: false, message: message.includes("duplicate key") ? "A GPS device with that unique value already exists." : message };
  }
}
