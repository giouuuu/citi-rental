"use server";

import { z } from "zod";

import { mapRentalDbError } from "@/features/rentals/lib/booking-gates";
import { planPastRental, type PastRentalField, type PastRentalInput } from "@/features/rentals/lib/past-rental";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const field = z.string().max(2000);
const inputSchema = z.object({
  referenceNumber: field,
  customerId: field,
  vehicleId: field,
  bookedAt: field,
  startAt: field,
  expectedReturnAt: field,
  actualReturnAt: field,
  withDriver: z.boolean(),
  dailyRate: field,
  driverFee: field,
  totalCharged: field,
  amountPaid: field,
  paymentMethod: field,
  paidAt: field,
  paymentReference: field,
  pickupLocation: field,
  returnLocation: field,
  destination: field,
  startingOdometer: field,
  endingOdometer: field,
  notes: field,
}) satisfies z.ZodType<PastRentalInput>;

/**
 * Saves a rental that already happened, straight as completed. The owner must
 * have ticked the acknowledgement on the preview, and the total they saw must
 * still be the total the server prices — otherwise nothing is saved.
 */
export async function recordPastRentalAction(
  input: PastRentalInput,
  confirmation: { acknowledged: boolean; previewTotal: number },
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to record rentals." };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Review the rental details." };
  if (confirmation.acknowledged !== true) {
    return { success: false, message: "Tick the confirmation on the preview before saving." };
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
    if (!profile?.is_active || !isAdminRole(profile.role)) {
      return { success: false, message: "Only owners and admins can record past rentals." };
    }

    const [{ data: vehicle, error: vehicleError }, { data: company }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, plate_number, name, daily_rate, half_day_rate, hourly_rate")
        .eq("id", parsed.data.vehicleId)
        .maybeSingle(),
      supabase.from("company_profile").select("driver_daily_rate").limit(1).maybeSingle(),
    ]);
    if (vehicleError) throw vehicleError;
    const rate = (value: unknown) => (value == null ? null : Number(value));

    const plan = planPastRental(parsed.data, {
      car: vehicle
        ? {
            id: vehicle.id,
            plateNumber: vehicle.plate_number,
            name: vehicle.name,
            dailyRate: rate(vehicle.daily_rate),
            halfDayRate: rate(vehicle.half_day_rate),
            hourlyRate: rate(vehicle.hourly_rate),
          }
        : null,
      driverDailyRate: rate(company?.driver_daily_rate),
      now: new Date(),
    });
    if (!plan.ok) {
      return {
        success: false,
        message: "Review the highlighted fields.",
        fieldErrors: Object.fromEntries(
          Object.entries(plan.fieldErrors).map(([key, message]) => [key, [message as string]]),
        ) as Partial<Record<PastRentalField, string[]>>,
      };
    }
    if (plan.preview.total !== confirmation.previewTotal) {
      return {
        success: false,
        message: "The price changed since the preview (the car's rates were updated). Go back, check it, and confirm again.",
      };
    }

    const { data: rentalId, error } = await supabase.rpc("record_past_rental", {
      ...plan.args,
      p_acknowledged: true,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    revalidateResource("/analytics");
    revalidateResource("/customers");
    const id = String(rentalId);
    return { success: true, data: { id, href: `/rentals/${id}` } };
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    // The RPC's own checks already read as instructions; pass them through.
    if (candidate?.code === "22023" && candidate.message) {
      return { success: false, message: candidate.message };
    }
    if (candidate?.code === "23505") {
      return {
        success: false,
        message: "That reference number is already used. Enter a different one.",
        fieldErrors: { referenceNumber: ["Already used by another rental."] },
      };
    }
    return { success: false, message: mapRentalDbError(error) };
  }
}
