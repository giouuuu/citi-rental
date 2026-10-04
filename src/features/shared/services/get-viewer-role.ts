import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/features/shared/lib/app-roles";

/**
 * The signed-in user's role from `profiles` (never from JWT metadata), or null
 * without an active profile. Cached per request.
 */
export const getViewerRole = cache(async (): Promise<AppRole | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  return profile?.is_active ? (profile.role as AppRole) : null;
});
