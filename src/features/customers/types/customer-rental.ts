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
};

export type CustomerRentalSummary = {
  rentals: number;
  cancellations: number;
  lifetimeValue: number;
  outstanding: number;
  lateReturns: number;
  averageDays: number | null;
  firstRentalAt: string | null;
  lastRentalAt: string | null;
};
