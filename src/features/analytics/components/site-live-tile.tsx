"use client";

import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { getSiteLiveAction } from "@/features/analytics/actions/get-site-live-action";
import type { SiteLive } from "@/features/analytics/types/analytics";

const POLL_MS = 30_000;

/**
 * People on the customer site in the last 5 minutes. Refreshes every 30
 * seconds while this tab is visible; a failed poll keeps the last number.
 */
export function SiteLiveTile({ initial }: { initial: SiteLive }) {
  const [live, setLive] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await getSiteLiveAction().catch(() => null);
      if (!cancelled && result?.ok) setLive(result.data);
    };
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span
            aria-hidden="true"
            className={live.visitorsNow ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground/40"}
          />
          On the site now
        </p>
        <p
          aria-live="polite"
          className="text-2xl leading-none font-bold tracking-tight tabular-nums"
        >
          {live.visitorsNow.toLocaleString("en-PH")}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Active in the last 5 minutes
          {live.facebookNow ? ` · ${live.facebookNow} from Facebook` : ""} ·{" "}
          {live.visitorsToday.toLocaleString("en-PH")} today
        </p>
      </CardContent>
    </Card>
  );
}
