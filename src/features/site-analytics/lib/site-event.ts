import { SEO_PAGES } from "@/features/seo/lib/seo-pages";

export const SITE_EVENT_TYPES = [
  "page_view",
  "vehicle_view",
  "booking_start",
  "booking_submit",
] as const;

export type SiteEventType = (typeof SITE_EVENT_TYPES)[number];

/** Anonymous first-party ids. No IP or user agent is ever stored. */
export const VISITOR_COOKIE = "zk_vid";
export const SESSION_COOKIE = "zk_sid";
/** Last non-direct source, `source` or `source:campaign`. */
export const SOURCE_COOKIE = "zk_src";

export const VISITOR_MAX_AGE = 60 * 60 * 24 * 400;
/** A session ends after 30 minutes without activity. */
export const SESSION_MAX_AGE = 60 * 30;
/** A Facebook click still gets credit for a booking made within 30 days. */
export const SOURCE_MAX_AGE = 60 * 60 * 24 * 30;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID}$`, "i");
const BOOKING_PATH = new RegExp(`^/book/(${UUID})(?:/continue)?/?$`, "i");

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Customer-facing pages. Ops routes are never tracked. */
export function isTrackedPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    SEO_PAGES.some((page) => page.path === pathname)
  );
}

/**
 * Opening `/book/<car>` (or its sign-in step) is a booking start for
 * that car; every other tracked page is a plain page view.
 */
export function pageEventFor(pathname: string): {
  type: Extract<SiteEventType, "page_view" | "booking_start">;
  vehicleId: string | null;
} {
  const match = BOOKING_PATH.exec(pathname);
  return match
    ? { type: "booking_start", vehicleId: match[1].toLowerCase() }
    : { type: "page_view", vehicleId: null };
}

export function encodeSourceCookie(
  source: string,
  campaign: string | null,
): string {
  return campaign ? `${source}:${encodeURIComponent(campaign)}` : source;
}

export function decodeSourceCookie(
  value: string | undefined,
): { source: string; campaign: string | null } | null {
  if (!value) return null;
  const [source, campaign] = value.split(":", 2);
  if (!/^[a-z0-9._-]{1,40}$/.test(source)) return null;
  try {
    return {
      source,
      campaign: campaign ? decodeURIComponent(campaign).slice(0, 80) : null,
    };
  } catch {
    return { source, campaign: null };
  }
}
