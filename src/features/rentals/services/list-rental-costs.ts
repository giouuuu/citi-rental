import "server-only";

import { parseRentalCosts, type RentalCosts } from "@/features/rentals/lib/rental-costs";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Every recorded expense on a rental: costs entered on its bill lines and
 * costs tagged to it in Finance. The costs live in the owner-only expense
 * ledger; the RPC lets owners and admins read just these rows.
 */
export async function listRentalCosts(rentalId: string): Promise<RentalCosts> {
  if (!isSupabaseConfigured()) return { costs: [], canOpenFinance: false };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_rental_costs", {
    p_rental_id: rentalId,
  });

  // Costs are internal detail; the bill still renders without them.
  if (error) {
    console.error("listRentalCosts failed", error.message);
    return { costs: [], canOpenFinance: false };
  }

  return parseRentalCosts(data);
}
