"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { vehicleExpenseCategoryDefinition } from "@/features/vehicle-costs/schemas/vehicle-expense-category-definition";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Your session expired. Sign in and try again.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active) throw new Error("Your profile is not active.");
  if (!isAdminRole(profile.role)) throw new Error("Only owners and admins can manage expense categories.");
  return supabase;
}

function categoryMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return message.includes("vehicle_expense_categories_name_key")
    ? "A category with that name already exists. Re-activate it instead."
    : message || fallback;
}

/** The form's category picker and the Costs tab read the list too. */
function revalidateCategories() {
  revalidateResource(vehicleExpenseCategoryDefinition.route);
  revalidateResource("/expenses");
  revalidateResource("/vehicles");
}

export async function saveVehicleExpenseCategoryAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to manage expense categories." };
  }

  const parsed = vehicleExpenseCategoryDefinition.schema.safeParse({
    name: formData.get("name") || undefined,
    sort_order: formData.get("sort_order") || undefined,
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted category fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await requireAdmin();
    const payload: Record<string, unknown> = {
      name: parsed.data.name,
      is_active: parsed.data.is_active,
    };
    if (parsed.data.sort_order !== undefined) payload.sort_order = parsed.data.sort_order;

    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const request = id
      ? supabase.from("vehicle_expense_categories").update(payload).eq("id", id).select("id").maybeSingle()
      : supabase.from("vehicle_expense_categories").insert(payload).select("id").single();
    const { data, error } = await request;
    if (error) throw error;
    if (!data) throw new Error("The category was not found.");

    const savedId = String(data.id);
    revalidateCategories();
    return {
      success: true,
      data: { id: savedId, href: `${vehicleExpenseCategoryDefinition.route}/${savedId}` },
    };
  } catch (error) {
    return { success: false, message: categoryMessage(error, "The category could not be saved.") };
  }
}

export async function archiveVehicleExpenseCategoryAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The category ID is missing." };
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("vehicle_expense_categories")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The category was not found.");
    revalidateCategories();
    return { success: true };
  } catch (error) {
    return { success: false, message: categoryMessage(error, "The category could not be archived.") };
  }
}
