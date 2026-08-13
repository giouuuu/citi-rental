import "server-only";

import { unstable_rethrow } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks active rentals past their expected return as overdue for the caller's
 * organization, returning how many moved.
 *
 * Called from ops page renders rather than a scheduled job — pg_cron is not
 * enabled here. A sweep failure is swallowed on purpose: this runs alongside
 * the real page data, and a broken sweep must never blank an ops screen.
 */
export async function sweepOverdueRentals(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sweep_overdue_rentals");
    if (error) throw error;
    return typeof data === "number" ? data : 0;
  } catch (error) {
    // cookies() throws a control-flow error to mark the route dynamic. Catching
    // it here would suppress that signal, so hand Next.js's own errors back.
    unstable_rethrow(error);
    // PostgrestError has no enumerable own properties, so passing the object
    // straight to console.error logs a useless `{}`.
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
    console.error(`Overdue rental sweep failed: ${detail}`);
    return 0;
  }
}
