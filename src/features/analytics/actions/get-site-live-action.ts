"use server";

import { getSiteLive } from "@/features/analytics/services/site-analytics";
import type { AnalyticsResult, SiteLive } from "@/features/analytics/types/analytics";

/** Polled by the live-visitors tile. The RPC itself checks owner/admin. */
export async function getSiteLiveAction(): Promise<AnalyticsResult<SiteLive>> {
  return getSiteLive();
}
