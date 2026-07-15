export type VehicleStatus =
  | "available"
  | "reserved"
  | "rented"
  | "maintenance"
  | "inactive";

export type Vehicle = {
  id: string;
  plate_number: string;
  name: string;
  make: string;
  model: string;
  status: VehicleStatus;
};
