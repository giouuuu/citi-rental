"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  canTransitionRental,
  mapRentalDbError,
  parseAvailabilityResult,
  type RentalWorkflowStatus,
} from "@/features/rentals/lib/booking-gates";

const transitionSchema = z.object({
  id: z.uuid(),
  status: z.enum(["reserved", "active", "completed", "cancelled", "overdue"]),
  actual_return_at: z.string().optional(),
  ending_odometer: z.coerce.number().min(0).optional(),
  ending_fuel_level: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function transitionRentalAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "The rental transition data is invalid.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) {
      throw new Error("Your profile is not active for this organization.");
    }
    if (!isStaffRole(profile.role)) {
      throw new Error("Your role cannot modify rentals.");
    }

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select(
        "id, status, vehicle_id, start_at, expected_return_at, tracking_consent_at, customer_id",
      )
      .eq("id", parsed.data.id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (rentalError) throw rentalError;
    if (!rental) throw new Error("The rental was not found in your organization.");

    const currentStatus = rental.status as RentalWorkflowStatus;
    if (
      parsed.data.status !== "overdue" &&
      !canTransitionRental(currentStatus, parsed.data.status)
    ) {
      return {
        success: false,
        message: `Cannot move a ${currentStatus} rental to ${parsed.data.status}.`,
      };
    }

    if (
      parsed.data.status === "active" ||
      parsed.data.status === "completed"
    ) {
      return {
        success: false,
        message:
          parsed.data.status === "active"
            ? "Use Start with inspection to begin this rental."
            : "Use Complete with inspection to finish this rental.",
      };
    }

    if (
      parsed.data.status === "reserved" ||
      parsed.data.status === "overdue"
    ) {
      const { data: availability, error: availabilityError } =
        await supabase.rpc("check_vehicle_availability", {
          p_vehicle_id: rental.vehicle_id,
          p_start_at: rental.start_at,
          p_expected_return_at: rental.expected_return_at,
          p_exclude_rental_id: rental.id,
        });
      if (availabilityError) throw availabilityError;
      const gate = parseAvailabilityResult(availability);
      if (!gate.available) {
        return {
          success: false,
          message:
            gate.reason ??
            "This vehicle is already booked for those dates.",
        };
      }
    }

    // Overdue transitions may still need tracking consent stamped.
    if (parsed.data.status === "overdue" && !rental.tracking_consent_at) {
      const { data: customer } = await supabase
        .from("customers")
        .select("tracking_consent_at")
        .eq("id", rental.customer_id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (!customer?.tracking_consent_at) {
        const { error: consentError } = await supabase
          .from("rentals")
          .update({ tracking_consent_at: new Date().toISOString() })
          .eq("id", rental.id)
          .eq("organization_id", profile.organization_id);
        if (consentError) throw consentError;
      }
    }

    const { error } = await supabase.rpc("transition_rental", {
      p_rental_id: parsed.data.id,
      p_status: parsed.data.status,
      p_actual_return_at: parsed.data.actual_return_at || null,
      p_ending_odometer: parsed.data.ending_odometer ?? null,
      p_ending_fuel_level: parsed.data.ending_fuel_level ?? null,
      p_notes: parsed.data.notes || null,
    });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}
