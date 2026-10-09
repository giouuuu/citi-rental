/** The customer site's real address — what goes on Facebook posts. */
export const PUBLIC_SITE_URL = "https://www.zekecebucarrental.com";

/**
 * Absolute base for links back into this app: pay pages, auth email
 * redirects, ops links in Telegram. `NEXT_PUBLIC_SITE_URL` wins; production
 * falls back to the real domain, never Vercel's per-deployment address.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production") return PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
