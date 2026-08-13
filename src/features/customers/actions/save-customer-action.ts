"use server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { customerDefinition } from "@/features/customers/schemas/customer-definition";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function saveCustomerAction(formData: FormData): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to create or update customers." };
  const values = Object.fromEntries(customerDefinition.fields.map((field) => {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") return [field.name, raw === "on"];
    return [field.name, raw === null || raw === "" ? undefined : raw];
  }));
  const parsed = customerDefinition.schema.safeParse(values);
  if (!parsed.success) return { success: false, message: "Review the highlighted customer fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("organization_id, role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!isStaffRole(profile.role)) throw new Error("Your role cannot modify customers.");
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (id) {
      const { data, error } = await supabase.from("customers").update(payload).eq("id", id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The customer was not found in your organization.");
      revalidateResource(customerDefinition.route);
      return { success: true, data: { id, href: `${customerDefinition.route}/${id}` } };
    }
    const { data, error } = await supabase.from("customers").insert({ ...payload, organization_id: profile.organization_id }).select("id").single();
    if (error) throw error;
    const savedId = String(data.id);
    revalidateResource(customerDefinition.route);
    return { success: true, data: { id: savedId, href: `${customerDefinition.route}/${savedId}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The customer could not be saved.";
    return { success: false, message: message.includes("duplicate key") ? "A customer with that unique value already exists." : message };
  }
}
