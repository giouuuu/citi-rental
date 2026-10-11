import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  resolveReviewLinks,
  type ReviewLinks,
} from "@/features/settings/lib/review-links";
import { getPublicContactChannels } from "@/features/settings/services/get-public-contact-channels";

/** The thank-you note and review links a completed rental shows the renter. */
export async function getPublicReviewLinks(): Promise<ReviewLinks> {
  if (!isSupabaseConfigured()) return resolveReviewLinks({}, {});

  const supabase = await createClient();
  const [{ data, error }, contact] = await Promise.all([
    supabase.rpc("get_public_review_links"),
    getPublicContactChannels(),
  ]);

  if (error) console.error("get_public_review_links failed", error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { google: string | null; facebook: string | null; thank_you: string | null }
    | undefined;

  return resolveReviewLinks(
    { google: row?.google, facebook: row?.facebook, thankYou: row?.thank_you },
    contact,
  );
}
