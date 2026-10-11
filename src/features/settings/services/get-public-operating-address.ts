import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Where the business operates, from Settings. Null when not set. */
export async function getPublicOperatingAddress(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_operating_address");

  if (error) {
    console.error("get_public_operating_address failed", error.message);
    return null;
  }
  return typeof data === "string" && data.trim() ? data.trim() : null;
}
