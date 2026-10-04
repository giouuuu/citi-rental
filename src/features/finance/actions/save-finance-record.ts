import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult, ResourceDefinition } from "@/features/shared/types/resource";

/**
 * The books are owner-only (RLS: private.is_finance_user). Checking here too
 * turns a silent zero-row write into a message the owner can act on.
 */
export async function requireOwner(): Promise<Awaited<ReturnType<typeof createClient>>> {
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
  if (profile.role !== "owner") throw new Error("Only the owner can change the books.");
  return supabase;
}

/** Postgres check/unique violations, said in words. */
export function financeWriteMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : fallback;
  if (message.includes("fixed_assets_vehicle_id_key")) return "That vehicle already has a register entry.";
  if (message.includes("vehicle_loans_one_active_per_vehicle")) {
    return "This car already has an active loan. Close it before adding another.";
  }
  if (message.includes("duplicate key")) return "A record with those details already exists.";
  if (message.includes("row-level security")) return "Only the owner can change the books.";
  if (message.includes("violates check constraint")) return "One of the amounts or dates is out of range. Review the fields and try again.";
  return message || fallback;
}

/** Form values for a definition's fields; blanks are undefined, checkboxes booleans. */
export function readDefinitionForm(definition: ResourceDefinition, formData: FormData) {
  return Object.fromEntries(
    definition.fields.map((field) => {
      const raw = formData.get(field.name);
      if (field.type === "checkbox") return [field.name, raw === "on"];
      return [field.name, raw === null || raw === "" ? undefined : raw];
    }),
  );
}

/**
 * Validates and writes one finance record. Blank optional fields are written
 * as null, so clearing a field on edit actually clears it. Every write also
 * refreshes /finance, whose statement depends on all of these tables.
 */
export async function saveFinanceRecord({
  definition,
  table,
  formData,
  noun,
}: {
  definition: ResourceDefinition;
  table: string;
  formData: FormData;
  noun: string;
}): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: `Connect Supabase to record ${noun}s.` };
  }

  const parsed = definition.schema.safeParse(readDefinitionForm(definition, formData));
  if (!parsed.success) {
    return {
      success: false,
      message: `Review the highlighted ${noun} fields.`,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await requireOwner();
    const payload = Object.fromEntries(
      definition.fields.map((field) => [field.name, parsed.data[field.name] ?? null]),
    );
    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;

    const request = id
      ? supabase.from(table).update(payload).eq("id", id).select("id").maybeSingle()
      : supabase.from(table).insert(payload).select("id").single();
    const { data, error } = await request;
    if (error) throw error;
    if (!data) throw new Error(`The ${noun} was not found.`);

    const savedId = String(data.id);
    revalidateResource(definition.route);
    revalidateResource("/finance");
    // Vehicle-tagged records feed that car's overview and financing tabs.
    if (payload.vehicle_id) revalidateResource("/vehicles");
    return { success: true, data: { id: savedId, href: `${definition.route}/${savedId}` } };
  } catch (error) {
    return { success: false, message: financeWriteMessage(error, `The ${noun} could not be saved.`) };
  }
}
