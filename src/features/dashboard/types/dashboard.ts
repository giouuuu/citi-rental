export type DashboardRentalStatus = "draft" | "reserved" | "active" | "overdue";

/** An open rental as the dashboard shows it. Overdue is already derived. */
export type DashboardRental = {
  id: string;
  reference: string;
  customerName: string;
  vehiclePlate: string;
  vehicleName: string;
  status: DashboardRentalStatus;
  source: "ops" | "public_web";
  startAt: string;
  expectedReturnAt: string;
  createdAt: string;
};

export type DashboardSnapshot = {
  todayKey: string;
  fleet: { total: number; available: number; maintenance: number };
  onRentNow: number;
  overdue: DashboardRental[];
  dueBackToday: DashboardRental[];
  pickupsToday: DashboardRental[];
  upcomingPickups: DashboardRental[];
  awaitingDeposit: DashboardRental[];
  recentBookings: DashboardRental[];
};
