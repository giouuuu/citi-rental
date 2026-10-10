import { describe, expect, it } from "vitest";

import { isPublicRoute } from "@/lib/supabase/proxy";

describe("isPublicRoute", () => {
  it("lets guests browse and fill in a booking", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/book/abc")).toBe(true);
    expect(isPublicRoute("/book/abc/continue")).toBe(true);
    expect(isPublicRoute("/book/confirmation")).toBe(true);
    expect(isPublicRoute("/login")).toBe(true);
  });

  it("keeps the account and pay pages for signed-in customers", () => {
    expect(isPublicRoute("/account")).toBe(false);
    expect(isPublicRoute("/account/bookings/123")).toBe(false);
    expect(isPublicRoute("/account/bookings/123/condition")).toBe(false);
    expect(isPublicRoute("/book/pay")).toBe(false);
    expect(isPublicRoute("/book/pay/123")).toBe(false);
  });

  it("does not treat look-alike paths as signed-in only", () => {
    expect(isPublicRoute("/book/payment-terms")).toBe(true);
    expect(isPublicRoute("/accounts")).toBe(false);
  });

  it("keeps ops routes signed-in only", () => {
    expect(isPublicRoute("/dashboard")).toBe(false);
    expect(isPublicRoute("/rentals/123")).toBe(false);
  });
});
