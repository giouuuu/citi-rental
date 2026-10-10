"use server";

import { z } from "zod";

import {
  listPublicVehicleBookedRanges,
  type PublicVehicleBookedRange,
} from "@/features/booking/services/list-public-vehicle-booked-ranges";
import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The booked days of the car a customer switched to on the booking page. */
export async function getVehicleBookedRangesAction(
  vehicleId: string,
): Promise<PublicVehicleBookedRange[]> {
  const parsed = z.uuid().safeParse(vehicleId);
  if (!parsed.success) return [];
  return listPublicVehicleBookedRanges(parsed.data);
}

/** Bookable cars with no reservation on any day from `start` to `end`. */
export async function listCarsFreeForDatesAction(
  start: string,
  end: string,
): Promise<PublicListedVehicle[]> {
  const parsed = z.object({ start: dateKey, end: dateKey }).safeParse({
    start,
    end,
  });
  if (!parsed.success || parsed.data.end < parsed.data.start) return [];
  return listPublicAvailableVehicles({
    startDate: parsed.data.start,
    endDate: parsed.data.end,
  });
}
