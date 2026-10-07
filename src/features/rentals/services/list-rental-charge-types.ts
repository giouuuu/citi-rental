import "server-only";

import type { RentalChargeType } from "@/features/rentals/types/rental-payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Active charge types, in the order owners set in Settings. */
export async function listRentalChargeTypes(): Promise<RentalChargeType[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rental_charge_types")
    .select("id, name, default_amount")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  // One form on the Bill & payments tab; an empty list there beats a broken page.
  if (error || !data) {
    console.error("listRentalChargeTypes failed", error?.message);
    return [];
  }

  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    defaultAmount: row.default_amount != null ? Number(row.default_amount) : null,
  }));
}
