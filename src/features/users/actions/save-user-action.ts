"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/types/resource";
import { userDefinition } from "@/features/users/schemas/user-definition";
export async function saveUserAction(formData: FormData): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to create or update users." };
  const values = Object.fromEntries(userDefinition.fields.map((field) => {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") return [field.name, raw === "on"];
    return [field.name, raw === null || raw === "" ? undefined : raw];
  }));
  const parsed = userDefinition.schema.safeParse(values);
  if (!parsed.success) return { success: false, message: "Review the highlighted user fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active || profile.role !== "administrator") throw new Error("Only administrators can modify users.");
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : String(parsed.data.id);
    const payload = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => key !== "id" && value !== undefined));
    const { data, error } = await supabase.from("profiles").update(payload).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: inserted, error: insertError } = await supabase.from("profiles").insert({ ...parsed.data, organization_id: profile.organization_id }).select("id").single();
      if (insertError) throw insertError;
      return { success: true, data: { id: String(inserted.id), href: `${userDefinition.route}/${inserted.id}` } };
    }
    return { success: true, data: { id, href: `${userDefinition.route}/${id}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The user could not be saved.";
    return { success: false, message: message.includes("duplicate key") ? "A user with that ID already exists." : message };
  }
}
