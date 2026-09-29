import type { Metadata } from "next";
import { connection } from "next/server";

import { DashboardScreen } from "@/features/dashboard";
import { sweepOverdueRentals } from "@/features/rentals";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page() {
  // "Due today" and "overdue" depend on the clock — never prerender them,
  // even in demo mode where no cookie read would make the route dynamic.
  await connection();
  await sweepOverdueRentals();

  return <DashboardScreen />;
}
