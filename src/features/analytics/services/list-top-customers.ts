import "server-only";

import { demoTopCustomers } from "@/features/analytics/lib/demo-analytics";
import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type { AnalyticsResult, TopCustomer } from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type TopCustomerRow = {
  customer_id: string;
  full_name: string;
  phone_number: string | null;
  is_blocked: boolean;
  rentals_in_window: number;
  rentals_lifetime: number;
  collected_in_window: number | string;
  collected_lifetime: number | string;
  outstanding: number | string;
  late_returns_lifetime: number;
  first_rental_at: string | null;
  last_rental_at: string | null;
};

export async function listTopCustomers(
  from: string,
  to: string,
  limit = 10,
): Promise<AnalyticsResult<TopCustomer[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: true, data: demoTopCustomers(buildDemoWorkspace(), from, to, limit) };
  }

  return runAnalyticsRpc<TopCustomerRow, TopCustomer[]>(
    "analytics_top_customers",
    { p_from: from, p_to: to, p_limit: limit },
    (rows) =>
      rows.map((row) => ({
        customerId: row.customer_id,
        fullName: row.full_name,
        phoneNumber: row.phone_number,
        isBlocked: Boolean(row.is_blocked),
        rentalsInWindow: Number(row.rentals_in_window),
        rentalsLifetime: Number(row.rentals_lifetime),
        collectedInWindow: toMoney(row.collected_in_window),
        collectedLifetime: toMoney(row.collected_lifetime),
        outstanding: toMoney(row.outstanding),
        lateReturnsLifetime: Number(row.late_returns_lifetime),
        firstRentalAt: row.first_rental_at,
        lastRentalAt: row.last_rental_at,
      })),
  );
}
