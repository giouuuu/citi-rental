export type DeviceKind = "mobile" | "tablet" | "desktop";

/**
 * Crawlers, link-preview fetchers (Facebook builds a preview of every shared
 * link with `facebookexternalhit`) and headless browsers are not visitors.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|preview|headless|lighthouse|pagespeed|vercel-screenshot|curl|wget|python-requests|axios|node-fetch/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export function deviceFromUserAgent(
  userAgent: string | null | undefined,
): DeviceKind {
  if (!userAgent) return "desktop";
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(userAgent))
    return "tablet";
  if (/mobi|iphone|ipod|android|windows phone/i.test(userAgent))
    return "mobile";
  return "desktop";
}
