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

/**
 * The signed-in account's email ("" when it has none), or null when signed
 * out. Bookings always go out under this email.
 */
export async function bookingUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return null;
  return typeof data.claims.email === "string" ? data.claims.email : "";
}
