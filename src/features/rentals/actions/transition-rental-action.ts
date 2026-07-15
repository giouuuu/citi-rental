"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/types/resource";
const transitionSchema = z.object({ id: z.uuid(), status: z.enum(["reserved", "active", "completed", "cancelled", "overdue"]), actual_return_at: z.string().optional(), ending_odometer: z.coerce.number().min(0).optional(), ending_fuel_level: z.coerce.number().min(0).max(100).optional(), notes: z.string().trim().max(2000).optional() });
export async function transitionRentalAction(formData: FormData): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "The rental transition data is invalid.", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active for this organization.");
    if (!["administrator", "rental_staff"].includes(profile.role)) throw new Error("Your role cannot modify rentals.");
    const { error } = await supabase.rpc("transition_rental", { p_rental_id: parsed.data.id, p_status: parsed.data.status, p_actual_return_at: parsed.data.actual_return_at || null, p_ending_odometer: parsed.data.ending_odometer ?? null, p_ending_fuel_level: parsed.data.ending_fuel_level ?? null, p_notes: parsed.data.notes || null });
    if (error) throw error;
    return { success: true };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "The rental status could not be changed." }; }
}
