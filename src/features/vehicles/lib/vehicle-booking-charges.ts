/** How a car's booking charge applies, as staff pick it. */
export type DrivingModeChoice = "self_drive" | "with_driver" | "both";

export const DRIVING_MODE_LABELS: Record<DrivingModeChoice, string> = {
  self_drive: "Self-drive",
  with_driver: "With driver",
  both: "Both",
};

/** One charge on one car in one driving mode (vehicle_booking_charges). */
export type VehicleBookingChargeRow = {
  id: string;
  chargeTypeId: string;
  name: string;
  drivingMode: "self_drive" | "with_driver";
  amount: number;
};

/** A charge type staff can pick, with the amount it pre-fills. */
export type BookingChargeOption = {
  id: string;
  name: string;
  defaultAmount: number | null;
};
