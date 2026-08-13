"use server";

import { z } from "zod";

import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

const schema = z.object({
  id: z.uuid("Select a rental."),
});

export async function confirmRentalDepositAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to confirm deposits." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Select a valid rental." };
  }

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
    if (!profile?.is_active || !isStaffRole(profile.role)) {
      throw new Error("Your role cannot confirm deposits.");
    }

    const { data, error } = await supabase.rpc("confirm_rental_deposit", {
      p_rental_id: parsed.data.id,
    });
    if (error) throw error;

    const payload = data as { success?: boolean; message?: string };
    if (!payload?.success) {
      throw new Error(payload?.message || "Could not confirm deposit.");
    }

    revalidateResource("/rentals");
    return { success: true, data: { id: parsed.data.id } };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not confirm the deposit.",
    };
  }
}
