"use server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
export async function archiveUserAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The user ID is missing." };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active || !isAdminRole(profile.role)) throw new Error("Only owners or admins can modify users.");
    const { data, error } = await supabase.from("profiles").update({ is_active: false }).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The user was not found in your organization.");
    revalidateResource("/settings/users");
    return { success: true };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "The user could not be disabled." }; }
}
