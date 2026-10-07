"use server";

import { z } from "zod";

import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type FleetBooking = {
  id: string;
  referenceNumber: string;
  status: string;
  startAt: string;
  endAt: string;
  vehicleId: string;
  plateNumber: string;
  vehicleName: string | null;
  customerName: string | null;
};

const rangeSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

/** Bookings on the calendar: held, out, late, or done. Drafts hold no car. */
const CALENDAR_STATUSES = ["reserved", "active", "overdue", "completed"];

/**
 * Every car's bookings that touch the window the fleet calendar is showing.
 * Called by the calendar as it pages, so only the visible weeks are loaded.
 */
export async function listFleetBookingsAction(input: {
  start: string;
  end: string;
}): Promise<ActionResult<FleetBooking[]>> {
  if (!isSupabaseConfigured()) return { success: true, data: [] };

  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid date range." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { success: false, message: "Your session expired. Sign in again." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active || !isAdminRole(profile.role))
    return { success: false, message: "Your role cannot view fleet bookings." };

  // Overlap: starts before the window ends and ends after it starts.
  const { data, error } = await supabase
    .from("rentals")
    .select(
      "id, reference_number, status, start_at, expected_return_at, actual_return_at, vehicle_id, vehicles ( plate_number, name ), customers ( full_name )",
    )
    .in("status", CALENDAR_STATUSES)
    .lt("start_at", parsed.data.end)
    .gt("expected_return_at", parsed.data.start)
    .order("start_at")
    .limit(1000);
  if (error) return { success: false, message: error.message };

  type Row = {
    id: string;
    reference_number: string;
    status: string;
    start_at: string;
    expected_return_at: string;
    actual_return_at: string | null;
    vehicle_id: string;
    vehicles: { plate_number: string; name: string | null } | null;
    customers: { full_name: string | null } | null;
  };

  return {
    success: true,
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      referenceNumber: row.reference_number,
      status: row.status,
      startAt: row.start_at,
      // A finished rental occupied the car until it actually came back.
      endAt:
        row.status === "completed" && row.actual_return_at
          ? row.actual_return_at
          : row.expected_return_at,
      vehicleId: row.vehicle_id,
      plateNumber: row.vehicles?.plate_number ?? "Car",
      vehicleName: row.vehicles?.name ?? null,
      customerName: row.customers?.full_name ?? null,
    })),
  };
}
