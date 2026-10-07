"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isTrackedPath, pageEventFor } from "@/features/site-analytics/lib/site-event";
import { trackSiteEvent } from "@/features/site-analytics/lib/track-site-event";

/**
 * Records a page view (or a booking start on `/book/<car>`) each time the
 * customer site's path changes. Ops routes are ignored. Query-only changes
 * (date filters on the fleet) are not new views.
 */
export function SiteTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !isTrackedPath(pathname) || lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    const event = pageEventFor(pathname);
    trackSiteEvent(event.type, { vehicleId: event.vehicleId });
  }, [pathname]);

  return null;
}
