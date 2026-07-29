import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** True when the request has an authenticated Supabase session. */
export async function isBookingUserSignedIn() {
  if (!isSupabaseConfigured()) return false;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string";
}
