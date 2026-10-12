"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import { getViewerRole } from "@/features/shared/services/get-viewer-role";
import type { ActionResult } from "@/features/shared/types/resource";

const chargeSchema = z.object({
  vehicleId: z.uuid("The vehicle is missing."),
  chargeTypeId: z.uuid("Choose a charge."),
  drivingMode: z.enum(["self_drive", "with_driver", "both"], {
    error: "Choose when it applies.",
  }),
  amount: z.coerce
    .number({ error: "Enter the amount." })
    .positive("Enter an amount above zero.")
    .max(1_000_000, "That amount is too large."),
});

export type SaveVehicleBookingChargeInput = z.input<typeof chargeSchema>;

async function requireAdminClient() {
  const role = await getViewerRole();
  if (!isAdminRole(role)) throw new Error("Only owners and admins can change booking charges.");
  return createClient();
}

/** The car's prices show on the vehicle page, the booking form and the landing page. */
function revalidateCarPrices() {
  revalidateResource("/vehicles");
  revalidatePath("/book/[vehicleId]", "page");
  revalidatePath("/", "page");
}

/**
 * Adds a charge to every online booking of this car in the driving mode, or
 * sets its amount when the car already has it. "Both" covers each mode.
 */
export async function saveVehicleBookingChargeAction(
  input: SaveVehicleBookingChargeInput,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to manage booking charges." };
  }
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { vehicleId, chargeTypeId, drivingMode, amount } = parsed.data;
  const modes = drivingMode === "both" ? ["self_drive", "with_driver"] : [drivingMode];

  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase.from("vehicle_booking_charges").upsert(
      modes.map((mode) => ({
        vehicle_id: vehicleId,
        charge_type_id: chargeTypeId,
        driving_mode: mode,
        amount,
      })),
      { onConflict: "vehicle_id,charge_type_id,driving_mode" },
    );
    if (error) throw error;
    revalidateCarPrices();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The charge could not be saved.",
    };
  }
}

/** Stops charging it on this car's new bookings; bookings made keep it. */
export async function removeVehicleBookingChargeAction(chargeId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(chargeId).success) {
    return { success: false, message: "The charge is missing." };
  }
  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase.from("vehicle_booking_charges").delete().eq("id", chargeId);
    if (error) throw error;
    revalidateCarPrices();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The charge could not be removed.",
    };
  }
}
