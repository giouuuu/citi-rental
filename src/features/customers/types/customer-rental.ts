export type CustomerRental = {
  id: string;
  reference: string;
  status: string;
  vehiclePlate: string;
  vehicleName: string;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string | null;
  quotedTotal: number;
  collected: number;
  penalties: number;
  /** Return odometer less release odometer; null until both are read. */
  kmDriven: number | null;
};

export type CustomerRentalSummary = {
  rentals: number;
  cancellations: number;
  lifetimeValue: number;
  outstanding: number;
  lateReturns: number;
  averageDays: number | null;
  /** Km across trips with both odometer readings. */
  totalKm: number;
  firstRentalAt: string | null;
  lastRentalAt: string | null;
};
