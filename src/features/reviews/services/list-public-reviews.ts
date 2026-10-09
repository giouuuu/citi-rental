import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { PublicReview } from "@/features/reviews/types/public-review";

/** Published reviews for the homepage, in the owner's display order. */
export async function listPublicReviews(): Promise<PublicReview[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_customer_reviews");
  if (error || !data) {
    // Missing until the reviews migration reaches the database.
    if (error) console.error("list_public_customer_reviews failed", error.message);
    return [];
  }

  return (data as PublicReview[]).map((row) => ({
    ...row,
    // Only site paths and uploaded photos; anything else is not an image.
    photo_url: row.photo_url && /^(\/|https:\/\/)/.test(row.photo_url) ? row.photo_url : null,
  })).filter((row) => row.photo_url || (row.reviewer_name && row.body));
}
