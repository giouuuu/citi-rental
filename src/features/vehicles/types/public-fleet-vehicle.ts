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
  /** Base daily rental rate in PHP. */
  daily_rate: number;
  color: string | null;
  /** Front-view cutout for the landing-page hero; null when none was uploaded. */
  showcase_image_url: string | null;
};
