import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * What each charge on a rental cost the business, keyed by the charge's
 * payment id. The costs live in the owner-only expense ledger; the RPC lets
 * owners and admins read just these rows.
 */
export async function listRentalChargeCosts(
  rentalId: string,
): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_rental_charge_costs", {
    p_rental_id: rentalId,
  });

  // Costs are internal detail; the bill still renders without them.
  if (error || !data) {
    console.error("listRentalChargeCosts failed", error?.message);
    return {};
  }

  return Object.fromEntries(
    (data as { payment_id: string; cost: number | string }[]).map((row) => [
      String(row.payment_id),
      Number(row.cost),
    ]),
  );
}
