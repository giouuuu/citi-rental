import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase is not configured. Add the public URL and publishable key.",
    );
  }

  return createBrowserClient(env.url, env.key);
}
