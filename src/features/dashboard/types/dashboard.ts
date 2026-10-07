export type DashboardRentalStatus = "draft" | "reserved" | "active" | "overdue";

/** An open rental as the dashboard shows it. Overdue is already derived. */
export type DashboardRental = {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string | null;
  vehicleId: string;
  vehiclePlate: string;
  vehicleName: string;
  status: DashboardRentalStatus;
  source: "ops" | "public_web";
  /** `rentals.payment_status`; `proof_submitted` means a deposit proof waits on staff. */
  paymentStatus: string;
  startAt: string;
  expectedReturnAt: string;
  createdAt: string;
  pickupLocation: string | null;
  returnLocation: string | null;
  /** Bill total less confirmed payments, never below zero. */
  balance: number;
};

export type DashboardVehicle = {
  id: string;
  plateNumber: string;
  name: string;
  status: string;
};

/**
 * One car changing hands. `late_pickup` is a reservation whose start has
 * passed without the car going out; `overdue` is a car past its return.
 */
export type HandoverKind = "release" | "late_pickup" | "return" | "overdue";

export type DashboardHandover = {
  kind: HandoverKind;
  /** When the handover is due: pickup time for releases, return time otherwise. */
  at: string;
  /** Whole hours past `at` for overdue returns and late pickups; 0 otherwise. */
  lateHours: number;
  rental: DashboardRental;
};

export type FleetCarState = "free" | "out" | "overdue" | "maintenance";

export type FleetBoardCar = {
  vehicle: DashboardVehicle;
  state: FleetCarState;
  /** The rental the car is out on, when out or overdue. */
  current: DashboardRental | null;
  /** The next reservation, when the car is free. */
  next: DashboardRental | null;
};

export type DashboardSnapshot = {
  todayKey: string;
  fleet: { total: number; available: number; maintenance: number };
  vehicles: DashboardVehicle[];
  onRentNow: number;
  /** Bookable cars not out on a rental right now. */
  freeNow: number;
  overdue: DashboardRental[];
  dueBackToday: DashboardRental[];
  pickupsToday: DashboardRental[];
  /** Cars that went out today and came back today, already handled. */
  releasedToday: number;
  returnedToday: number;
  handoversToday: DashboardHandover[];
  handoversTomorrow: DashboardHandover[];
  /** Drafts whose deposit proof is waiting for staff to check. */
  proofsToVerify: DashboardRental[];
  /** Drafts with no deposit yet. */
  awaitingDeposit: DashboardRental[];
  fleetBoard: FleetBoardCar[];
  collectedToday: number;
  /** Balances owed on today's releases and returns, overdue included. */
  toCollectToday: number;
};
