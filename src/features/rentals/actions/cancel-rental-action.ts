"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
export async function cancelRentalAction(formData: FormData): Promise<ActionResult> {
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) return { success: false, message: "The rental ID is invalid." };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!isStaffRole(profile.role)) throw new Error("Your role cannot modify rentals.");
    const { error } = await supabase.rpc("transition_rental", { p_rental_id: id.data, p_status: "cancelled", p_actual_return_at: null, p_ending_odometer: null, p_ending_fuel_level: null, p_notes: null });
    if (error) throw error;
    revalidateResource("/rentals");
    return { success: true };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "The rental could not be cancelled." }; }
}
