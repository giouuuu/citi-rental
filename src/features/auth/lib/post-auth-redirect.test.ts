import { describe, expect, it } from "vitest";

import {
  isBookingNextPath,
  resolvePostAuthPath,
  sanitizeNextPath,
} from "./post-auth-redirect";

describe("sanitizeNextPath", () => {
  it("accepts relative in-app paths", () => {
    expect(sanitizeNextPath("/book/abc?start=1")).toBe("/book/abc?start=1");
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects open redirects", () => {
    expect(sanitizeNextPath("//evil.com")).toBeUndefined();
    expect(sanitizeNextPath("https://evil.com")).toBeUndefined();
    expect(sanitizeNextPath("\\evil")).toBeUndefined();
    expect(sanitizeNextPath("")).toBeUndefined();
    expect(sanitizeNextPath(null)).toBeUndefined();
  });
});

describe("isBookingNextPath", () => {
  it("detects booking return paths", () => {
    expect(isBookingNextPath("/book/veh-1")).toBe(true);
    expect(isBookingNextPath("/dashboard")).toBe(false);
    expect(isBookingNextPath(undefined)).toBe(false);
  });
});

describe("resolvePostAuthPath", () => {
  const supabase = {} as never;

  it("sends owner and admin to the ops dashboard by default", async () => {
    await expect(resolvePostAuthPath(supabase, null, "owner")).resolves.toBe(
      "/dashboard",
    );
    await expect(resolvePostAuthPath(supabase, null, "admin")).resolves.toBe(
      "/dashboard",
    );
  });

  it("keeps staff and customers off the ops dashboard by default", async () => {
    await expect(resolvePostAuthPath(supabase, null, "staff")).resolves.toBe(
      "/",
    );
    await expect(resolvePostAuthPath(supabase, null, "customer")).resolves.toBe(
      "/",
    );
    await expect(
      resolvePostAuthPath(supabase, "/dashboard", "staff"),
    ).resolves.toBe("/");
  });

  it("always honors safe booking next paths", async () => {
    await expect(
      resolvePostAuthPath(supabase, "/book/veh-1", "customer"),
    ).resolves.toBe("/book/veh-1");
  });
});
