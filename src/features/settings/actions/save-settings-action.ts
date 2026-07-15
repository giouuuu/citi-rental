"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ActionResult } from "@/features/shared/types/resource";
const schema = z.object({ name: z.string().trim().min(2).max(120), timezone: z.string().trim().min(1).max(80), tracker_online_threshold_minutes: z.coerce.number().int().min(1).max(60), tracker_delayed_threshold_minutes: z.coerce.number().int().min(2).max(240), location_retention_days: z.coerce.number().int().min(1).max(3650), gps_provider: z.enum(["simulator", "traccar"]) }).refine((value) => value.tracker_delayed_threshold_minutes > value.tracker_online_threshold_minutes, { message: "Delayed threshold must be greater than the online threshold.", path: ["tracker_delayed_threshold_minutes"] });
export async function saveSettingsAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to save organization settings." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "Review the highlighted settings.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired.");
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active || profile.role !== "administrator") throw new Error("Only administrators can update organization settings.");
    const { error } = await supabase.rpc("update_organization_settings", { p_name: parsed.data.name, p_timezone: parsed.data.timezone, p_online_threshold: parsed.data.tracker_online_threshold_minutes, p_delayed_threshold: parsed.data.tracker_delayed_threshold_minutes, p_retention_days: parsed.data.location_retention_days, p_gps_provider: parsed.data.gps_provider });
    if (error) throw error;
    return { success: true };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "Settings could not be saved." }; }
}
