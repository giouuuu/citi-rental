import "server-only";

import {
  parseRentalNavCounts,
  type RentalNavCounts,
} from "@/features/rentals/lib/rental-nav-counts";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** First paint of the sidebar counts; the client keeps them live after that. */
export async function getRentalNavCounts(): Promise<RentalNavCounts | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rental_nav_counts");
  if (error) {
    console.error("rental_nav_counts failed", error.message);
    return null;
  }
  return parseRentalNavCounts(data);
}
