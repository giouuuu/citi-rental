import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

/**
 * Production lets crawlers into the customer site only; ops pages also send
 * `noindex`. Preview deployments are closed so they never compete with the
 * real domain.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/export/",
        "/account",
        "/book/pay/",
        "/book/confirmation",
        "/*/continue",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
