import { afterEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_SITE_URL, siteUrl } from "./site-url";

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses NEXT_PUBLIC_SITE_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test/");
    expect(siteUrl()).toBe("https://example.test");
  });

  it("falls back to the real domain in production, not the deployment URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "zeke-car-rental-abc123.vercel.app");
    expect(siteUrl()).toBe(PUBLIC_SITE_URL);
  });

  it("uses the deployment URL on previews and localhost in dev", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "zeke-car-rental-abc123.vercel.app");
    expect(siteUrl()).toBe("https://zeke-car-rental-abc123.vercel.app");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
