/** A charge added to every online booking of a car in one driving mode. */
export type VehicleBookingCharge = {
  name: string;
  amount: number;
  driving_mode: "self_drive" | "with_driver";
};

export type PublicFleetVehicle = {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  category: string | null;
  transmission: "automatic" | "manual" | "cvt" | null;
  fuel_type: "gasoline" | "diesel" | "hybrid" | "electric" | "other" | null;
  seating_capacity: number | null;
  photo_url: string | null;
  /** Self-drive rate per 24 hours in PHP. */
  daily_rate: number;
  /** Rate per 24 hours on a with-driver trip, before the driver; null: daily_rate. */
  with_driver_daily_rate: number | null;
  /** Charges added to every online booking of this car, per driving mode. */
  booking_charges: VehicleBookingCharge[];
  color: string | null;
  /** Front-view cutout for the landing-page hero; null when none was uploaded. */
  showcase_image_url: string | null;
};

/** One gallery angle, as shown on the public site. */
export type PublicVehiclePhoto = {
  kind: string;
  label: string;
  url: string;
};

/** A car on the landing-page fleet list, with its gallery in slot order. */
export type PublicListedVehicle = PublicFleetVehicle & {
  gallery: PublicVehiclePhoto[];
};
