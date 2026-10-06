import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Service-role client for RPCs that are deliberately closed to anon and
 * authenticated callers (e.g. lookup_booking_contact, which must only run
 * after a server-side Turnstile check). Bypasses RLS — never hand it a
 * user-controlled query, and never import it from client code.
 */
export function createAdminClient() {
  const env = getSupabasePublicEnv();
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env || !secret) return null;

  return createClient(env.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
