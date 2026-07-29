"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { geofenceDefinition } from "@/features/geofences/schemas/geofence-definition";
export async function saveGeofenceAction(formData: FormData): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to create or update geofences." };
  const values = Object.fromEntries(geofenceDefinition.fields.map((field) => {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") return [field.name, raw === "on"];
    return [field.name, raw === null || raw === "" ? undefined : raw];
  }));
  const parsed = geofenceDefinition.schema.safeParse(values);
  if (!parsed.success) return { success: false, message: "Review the highlighted geofence fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!isAdminRole(profile.role)) throw new Error("Your role cannot modify geofences.");
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (id) {
      const { data, error } = await supabase.from("geofences").update(payload).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The geofence was not found in your organization.");
      return { success: true, data: { id, href: `${geofenceDefinition.route}/${id}` } };
    }
    const { data, error } = await supabase.from("geofences").insert({ ...payload, organization_id: profile.organization_id }).select("id").single();
    if (error) throw error;
    const savedId = String(data.id);
    return { success: true, data: { id: savedId, href: `${geofenceDefinition.route}/${savedId}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The geofence could not be saved.";
    return { success: false, message };
  }
}
