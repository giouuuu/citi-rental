import type { SiteEventType } from "@/features/site-analytics/lib/site-event";

/**
 * Fire-and-forget beacon to `/api/events`. `keepalive` lets it finish when
 * the click that sent it also leaves the page.
 */
export function trackSiteEvent(
  type: Exclude<SiteEventType, "booking_submit">,
  options: { vehicleId?: string | null } = {},
) {
  if (typeof window === "undefined" || navigator.webdriver) return;
  try {
    void fetch("/api/events", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        path: window.location.pathname,
        search: window.location.search.slice(0, 1000),
        referrer: document.referrer.slice(0, 1000) || undefined,
        vehicleId: options.vehicleId ?? null,
      }),
    }).catch(() => {});
  } catch {
    // Analytics never gets in the way of the page.
  }
}
