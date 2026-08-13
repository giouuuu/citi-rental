"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { acknowledgeAlertSchema } from "@/features/alerts/schemas/acknowledge-alert-schema";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
export async function acknowledgeAlertAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to acknowledge alerts." };
  const parsed = acknowledgeAlertSchema.safeParse({ id: formData.get("id"), resolution_note: formData.get("resolution_note") || undefined });
  if (!parsed.success) return { success: false, message: "The alert or resolution note is invalid.", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!isStaffRole(profile.role)) throw new Error("Your role cannot acknowledge alerts.");
    const { error } = await supabase.rpc("acknowledge_tracking_event", { p_event_id: parsed.data.id, p_resolution_note: parsed.data.resolution_note ?? null });
    if (error) throw error;
    revalidateResource("/alerts");
    return { success: true };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "The alert could not be acknowledged." }; }
}
