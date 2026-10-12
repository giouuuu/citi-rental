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
// `/book/<car id or slug>`; `pay` and `confirmation` are other pages.
const BOOKING_PATH = /^\/book\/([a-z0-9-]{1,120})(?:\/continue)?\/?$/i;
const NOT_A_CAR = new Set(["pay", "confirmation"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A car slug as booking URLs carry it ("vios-automatic-red"). */
export function isVehicleSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && SLUG_PATTERN.test(value);
}

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
 * that car; every other tracked page is a plain page view. The car is in
 * the URL by id or, usually, by slug, which the server resolves.
 */
export function pageEventFor(pathname: string): {
  type: Extract<SiteEventType, "page_view" | "booking_start">;
  vehicleId: string | null;
  vehicleSlug: string | null;
} {
  const match = BOOKING_PATH.exec(pathname);
  const key = match?.[1].toLowerCase();
  if (!key || NOT_A_CAR.has(key)) {
    return { type: "page_view", vehicleId: null, vehicleSlug: null };
  }
  return isUuid(key)
    ? { type: "booking_start", vehicleId: key, vehicleSlug: null }
    : { type: "booking_start", vehicleId: null, vehicleSlug: key };
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
