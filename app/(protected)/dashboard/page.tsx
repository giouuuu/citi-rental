import type { Metadata } from "next";

import { DashboardScreen } from "@/features/dashboard";
import { sweepOverdueRentals } from "@/features/rentals";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page() {
  await sweepOverdueRentals();

  return <DashboardScreen />;
}
