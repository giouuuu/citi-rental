/** Grouping for a time series. Weeks start Monday; months on the 1st. */
export type AnalyticsBucket = "day" | "week" | "month";

/** A resolved analytics window of Manila local dates, both inclusive. */
export type AnalyticsWindow = {
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  /** The preset the window came from, or "custom" for hand-picked dates. */
  preset: AnalyticsPreset;
  /** Same-length window immediately before, for period-over-period deltas. */
  previous: { from: string; to: string };
  days: number;
};

export type AnalyticsPreset = "7d" | "30d" | "90d" | "12m" | "custom";

export type AnalyticsOverview = {
  bookingsCreated: number;
  bookingsPublic: number;
  bookingsOps: number;
  draftsOpen: number;
  cancellations: number;
  completedRentals: number;
  lateReturns: number;
  overdueNow: number;
  collected: number;
  refunds: number;
  penaltiesBilled: number;
  outstandingBalance: number;
  rentedVehicleDays: number;
  fleetVehicleDays: number;
  avgRentalDays: number | null;
  avgLeadTimeDays: number | null;
  customersTotal: number;
  customersBlocked: number;
  customersActive: number;
  customersNew: number;
  customersReturning: number;
};

export type AnalyticsTimeseriesPoint = {
  bucketStart: string;
  collected: number;
  penaltiesBilled: number;
  bookingsCreated: number;
  bookingsPublic: number;
  cancellations: number;
  rentedVehicleDays: number;
  fleetVehicleDays: number;
};

export type VehiclePerformance = {
  vehicleId: string;
  plateNumber: string;
  name: string;
  category: string | null;
  status: string;
  dailyRate: number | null;
  rentalCount: number;
  rentedDays: number;
  windowDays: number;
  collected: number;
  penaltiesBilled: number;
  lastReturnAt: string | null;
  nextStartAt: string | null;
  onRentNow: boolean;
};

export type TopCustomer = {
  customerId: string;
  fullName: string;
  phoneNumber: string | null;
  isBlocked: boolean;
  rentalsInWindow: number;
  rentalsLifetime: number;
  collectedInWindow: number;
  collectedLifetime: number;
  outstanding: number;
  lateReturnsLifetime: number;
  firstRentalAt: string | null;
  lastRentalAt: string | null;
};

/** A service result: data, or a message the panel shows in place of it. */
export type AnalyticsResult<T> = { ok: true; data: T } | { ok: false; message: string };
