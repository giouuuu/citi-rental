"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  financeWriteMessage,
  readDefinitionForm,
  requireOwner,
} from "@/features/finance/actions/save-finance-record";
import { expenseCategoryDefinition } from "@/features/finance/schemas/expense-category-definition";

/** `Car wash & detailing` → `car_wash_detailing`, fitting the code check. */
function codeFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 50);
  return slug.length >= 2 ? slug : `category_${slug}`;
}

function revalidateCategories() {
  revalidateResource(expenseCategoryDefinition.route);
  revalidateResource("/finance");
}

export async function saveExpenseCategoryAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to manage expense categories." };
  }

  const parsed = expenseCategoryDefinition.schema.safeParse(
    readDefinitionForm(expenseCategoryDefinition, formData),
  );
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted category fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await requireOwner();
    const values = parsed.data as {
      name: string;
      bir_line?: string;
      description?: string;
      default_ewt_percent?: number;
      sort_order?: number;
      is_active: boolean;
    };
    const payload: Record<string, unknown> = {
      name: values.name,
      bir_line: values.bir_line ?? values.name,
      description: values.description ?? null,
      default_ewt_percent: values.default_ewt_percent ?? null,
      is_active: values.is_active,
    };
    if (values.sort_order !== undefined) payload.sort_order = values.sort_order;

    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;

    if (id) {
      const { data, error } = await supabase
        .from("expense_categories")
        .update(payload)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The category was not found.");
      revalidateCategories();
      return { success: true, data: { id, href: `${expenseCategoryDefinition.route}/${id}` } };
    }

    // The code is internal (seeded lines are matched by it), so a new
    // category takes one from its name, suffixed when the name repeats.
    const base = codeFromName(values.name);
    const { data: taken, error: takenError } = await supabase
      .from("expense_categories")
      .select("code")
      .like("code", `${base}%`);
    if (takenError) throw takenError;
    const codes = new Set((taken ?? []).map((row) => String(row.code)));
    let code = base;
    for (let n = 2; codes.has(code); n += 1) code = `${base}_${n}`;

    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ ...payload, code })
      .select("id")
      .single();
    if (error) throw error;

    const savedId = String(data.id);
    revalidateCategories();
    return { success: true, data: { id: savedId, href: `${expenseCategoryDefinition.route}/${savedId}` } };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, "The category could not be saved.") };
  }
}

/** Categories are archived, never deleted: past expenses still point at them. */
export async function archiveExpenseCategoryAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The category ID is missing." };
  try {
    const supabase = await requireOwner();
    const { data, error } = await supabase
      .from("expense_categories")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The category was not found.");
    revalidateCategories();
    return { success: true };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, "The category could not be archived.") };
  }
}
