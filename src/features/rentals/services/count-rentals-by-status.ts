import "server-only";

import {
  RENTAL_STATUSES,
  type RentalStatusCounts,
} from "@/features/rentals/lib/rental-status-counts";
import { rentalDefinition } from "@/features/rentals/schemas/rental-definition";
import { applyResourceQuery } from "@/features/shared/services/select-resource-rows";
import type { ResourceQuery } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Rentals per status under the list's search and every filter but status
 * itself, so the cards still show the other statuses while one is picked.
 */
export async function countRentalsByStatus(
  query: ResourceQuery,
): Promise<RentalStatusCounts | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const otherFilters = { ...query.filters };
  delete otherFilters.status;
  const scoped = { ...query, filters: otherFilters };
  const results = await Promise.all(
    RENTAL_STATUSES.map((status) =>
      applyResourceQuery(
        supabase.from("rentals").select("id", { count: "exact", head: true }),
        rentalDefinition,
        scoped,
      ).eq("status", status),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("rental status counts failed", failed.error.message);
    return null;
  }
  return Object.fromEntries(
    RENTAL_STATUSES.map((status, index) => [status, results[index].count ?? 0]),
  ) as RentalStatusCounts;
}
