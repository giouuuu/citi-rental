/**
 * Sanitize and resolve post-auth redirect targets.
 *
 * Booking `next` paths are always honored when safe.
 * Only owner/admin land on the ops dashboard by default.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAdminRole } from "../../shared/lib/app-roles";

export function sanitizeNextPath(
  raw: string | null | undefined,
): string | undefined {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return undefined;
  }
  return value;
}

export function isBookingNextPath(path: string | undefined): boolean {
  return Boolean(path?.startsWith("/book/"));
}

const PUBLIC_HOME = "/";
const OPS_HOME = "/dashboard";

/**
 * Resolve where to send the user after login / OAuth callback.
 * Pass an optional role when already known to avoid an extra query.
 */
export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  rawNext: string | null | undefined,
  knownRole?: string | null,
): Promise<string> {
  const safeNext = sanitizeNextPath(rawNext);

  if (isBookingNextPath(safeNext)) {
    return safeNext!;
  }

  let role = knownRole ?? null;
  if (role == null) {
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (typeof userId === "string") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      role = profile?.role ?? null;
    }
  }

  if (!isAdminRole(role)) {
    // Non-ops roles: ignore /dashboard (and missing next) — send to landing.
    if (!safeNext || safeNext === OPS_HOME) {
      return PUBLIC_HOME;
    }
    return safeNext;
  }

  return safeNext ?? OPS_HOME;
}
