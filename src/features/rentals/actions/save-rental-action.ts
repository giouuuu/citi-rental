"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/types/resource";
import { rentalDefinition } from "@/features/rentals/schemas/rental-definition";
export async function saveRentalAction(formData: FormData): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to create or update rentals." };
  const values = Object.fromEntries(rentalDefinition.fields.map((field) => {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") return [field.name, raw === "on"];
    return [field.name, raw === null || raw === "" ? undefined : raw];
  }));
  const parsed = rentalDefinition.schema.safeParse(values);
  if (!parsed.success) return { success: false, message: "Review the highlighted rental fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!["administrator", "rental_staff"].includes(profile.role)) throw new Error("Your role cannot modify rentals.");
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (id) {
      const { data, error } = await supabase.from("rentals").update(payload).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The rental was not found in your organization.");
      return { success: true, data: { id, href: `${rentalDefinition.route}/${id}` } };
    }
    const { data, error } = await supabase.from("rentals").insert({ ...payload, organization_id: profile.organization_id }).select("id").single();
    if (error) throw error;
    const savedId = String(data.id);
    return { success: true, data: { id: savedId, href: `${rentalDefinition.route}/${savedId}` } };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "The rental could not be saved." }; }
}
