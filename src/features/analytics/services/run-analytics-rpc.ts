import "server-only";

import { unstable_rethrow } from "next/navigation";

import { analyticsErrorMessage, describeError } from "@/features/analytics/lib/analytics-error";
import type { AnalyticsResult } from "@/features/analytics/types/analytics";
import { createClient } from "@/lib/supabase/server";

/**
 * Calls one analytics RPC and maps its rows. Failures are logged and returned
 * as a message so a single broken panel never takes the page down.
 */
export async function runAnalyticsRpc<Row, T>(
  name: string,
  args: Record<string, unknown>,
  map: (rows: Row[]) => T,
): Promise<AnalyticsResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return { ok: true, data: map((data ?? []) as Row[]) };
  } catch (error) {
    // cookies() signals dynamic rendering by throwing; let Next.js have it.
    unstable_rethrow(error);
    console.error(`Analytics RPC ${name} failed: ${describeError(error)}`);
    return { ok: false, message: analyticsErrorMessage(error) };
  }
}
