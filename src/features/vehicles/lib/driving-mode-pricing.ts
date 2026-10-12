import type { BookingFeeLine } from "@/features/booking/lib/booking-fees";
import type {
  PublicFleetVehicle,
  VehicleBookingCharge,
} from "@/features/vehicles/types/public-fleet-vehicle";

type PricedVehicle = Pick<
  PublicFleetVehicle,
  "daily_rate" | "with_driver_daily_rate" | "booking_charges"
>;

/**
 * The car's rate per 24 hours for the driving mode: its with-driver rate
 * when it has one, otherwise the self-drive rate. Same rule as
 * create_public_booking.
 */
export function vehicleDailyRate(vehicle: PricedVehicle, withDriver: boolean): number {
  return withDriver && vehicle.with_driver_daily_rate != null
    ? vehicle.with_driver_daily_rate
    : vehicle.daily_rate;
}

/**
 * The car's charges on a booking in the driving mode, as bill lines. Same
 * rule as private.vehicle_booking_fee_lines.
 */
export function vehicleBookingFees(
  vehicle: PricedVehicle,
  withDriver: boolean,
): BookingFeeLine[] {
  const mode = withDriver ? "with_driver" : "self_drive";
  return vehicle.booking_charges
    .filter((charge) => charge.driving_mode === mode)
    .map(({ name, amount }) => ({ name, amount }));
}

/** The booking_charges a public car read returns; anything malformed is dropped. */
export function parseVehicleBookingCharges(value: unknown): VehicleBookingCharge[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const { name, amount, driving_mode } = line as Record<string, unknown>;
    const price = Number(amount);
    if (typeof name !== "string" || !name.trim()) return [];
    if (!Number.isFinite(price) || price <= 0) return [];
    if (driving_mode !== "self_drive" && driving_mode !== "with_driver") return [];
    return [{ name: name.trim(), amount: price, driving_mode }];
  });
}

/** A nullable money column as a number, or null. */
export function optionalRate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
