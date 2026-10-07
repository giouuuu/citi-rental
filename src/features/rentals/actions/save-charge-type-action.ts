"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { chargeTypeDefinition } from "@/features/rentals/schemas/charge-type-definition";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

export async function saveChargeTypeAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured())
    return {
      success: false,
      message: "Connect Supabase to manage charge types.",
    };

  const values = Object.fromEntries(
    chargeTypeDefinition.fields.map((field) => {
      const raw = formData.get(field.name);
      return [field.name, raw === null || raw === "" ? undefined : raw];
    }),
  );

  const parsed = chargeTypeDefinition.schema.safeParse(values);
  if (!parsed.success)
    return {
      success: false,
      message: "Review the highlighted charge type fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };

  try {
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
    if (!isAdminRole(profile.role))
      throw new Error("Only owners and admins can manage charge types.");

    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload: Record<string, unknown> = {
      name: parsed.data.name,
      // A cleared amount means "type it each time", so store null.
      default_amount: parsed.data.default_amount ?? null,
    };
    if (parsed.data.sort_order !== undefined)
      payload.sort_order = parsed.data.sort_order;

    if (id) {
      const { data, error } = await supabase
        .from("rental_charge_types")
        .update(payload)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The charge type was not found.");
      revalidateResource(chargeTypeDefinition.route);
      return {
        success: true,
        data: { id, href: `${chargeTypeDefinition.route}/${id}` },
      };
    }

    const { data, error } = await supabase
      .from("rental_charge_types")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;

    const savedId = String(data.id);
    revalidateResource(chargeTypeDefinition.route);
    return {
      success: true,
      data: { id: savedId, href: `${chargeTypeDefinition.route}/${savedId}` },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The charge type could not be saved.";
    return {
      success: false,
      message: message.includes("duplicate key")
        ? "An active charge type already has that name."
        : message,
    };
  }
}
