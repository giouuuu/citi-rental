import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingChargeOption,
  VehicleBookingChargeRow,
} from "@/features/vehicles/lib/vehicle-booking-charges";

type ChargeRow = {
  id: string;
  charge_type_id: string;
  driving_mode: string;
  amount: number | string;
  rental_charge_types: { name: string; sort_order: number } | { name: string; sort_order: number }[] | null;
};

/**
 * This car's booking charges, and the active charge types staff can add.
 * A failure only empties this panel; the rest of the vehicle page still loads.
 */
export async function listVehicleBookingCharges(vehicleId: string): Promise<{
  charges: VehicleBookingChargeRow[];
  options: BookingChargeOption[];
}> {
  if (!isSupabaseConfigured()) return { charges: [], options: [] };

  const supabase = await createClient();
  const [charges, types] = await Promise.all([
    supabase
      .from("vehicle_booking_charges")
      .select("id, charge_type_id, driving_mode, amount, rental_charge_types ( name, sort_order )")
      .eq("vehicle_id", vehicleId),
    supabase
      .from("rental_charge_types")
      .select("id, name, default_amount")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);
  if (charges.error) console.error("vehicle_booking_charges failed", charges.error.message);
  if (types.error) console.error("rental_charge_types failed", types.error.message);

  const rows = ((charges.data ?? []) as ChargeRow[]).flatMap((row) => {
    const type = Array.isArray(row.rental_charge_types)
      ? row.rental_charge_types[0]
      : row.rental_charge_types;
    if (!type || (row.driving_mode !== "self_drive" && row.driving_mode !== "with_driver")) {
      return [];
    }
    return [
      {
        id: row.id,
        chargeTypeId: row.charge_type_id,
        name: type.name,
        sortOrder: type.sort_order,
        drivingMode: row.driving_mode,
        amount: Number(row.amount),
      } as const,
    ];
  });
  rows.sort(
    (a, b) =>
      a.drivingMode.localeCompare(b.drivingMode) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );

  return {
    charges: rows.map((row) => ({
      id: row.id,
      chargeTypeId: row.chargeTypeId,
      name: row.name,
      drivingMode: row.drivingMode,
      amount: row.amount,
    })),
    options: (types.data ?? []).map((type) => ({
      id: String(type.id),
      name: String(type.name),
      defaultAmount: type.default_amount != null ? Number(type.default_amount) : null,
    })),
  };
}
