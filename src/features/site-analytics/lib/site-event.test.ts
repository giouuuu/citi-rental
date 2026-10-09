import { describe, expect, it } from "vitest";

import {
  decodeSourceCookie,
  encodeSourceCookie,
  isTrackedPath,
  pageEventFor,
} from "./site-event";
import { deviceFromUserAgent, isBotUserAgent } from "./user-agent";

const CAR = "0f8b3c1e-2a4d-4e6f-9a1b-3c5d7e9f1a2b";

describe("isTrackedPath", () => {
  it("tracks the customer site only", () => {
    expect(isTrackedPath("/")).toBe(true);
    expect(isTrackedPath(`/book/${CAR}`)).toBe(true);
    expect(isTrackedPath("/account")).toBe(true);
    expect(isTrackedPath("/car-rental-mactan-cebu-airport")).toBe(true);
    expect(isTrackedPath("/dashboard")).toBe(false);
    expect(isTrackedPath("/bookings")).toBe(false);
  });
});

describe("pageEventFor", () => {
  it("counts the booking page and its continue step as a booking start", () => {
    expect(pageEventFor(`/book/${CAR}`)).toEqual({
      type: "booking_start",
      vehicleId: CAR,
    });
    expect(pageEventFor(`/book/${CAR}/continue`)).toEqual({
      type: "booking_start",
      vehicleId: CAR,
    });
  });

  it("keeps payment and other pages as page views", () => {
    expect(pageEventFor(`/book/pay/${CAR}`).type).toBe("page_view");
    expect(pageEventFor("/book/confirmation").type).toBe("page_view");
    expect(pageEventFor("/").type).toBe("page_view");
  });
});

describe("source cookie", () => {
  it("round-trips a source and campaign", () => {
    const value = encodeSourceCookie("facebook", "oct promo:1");
    expect(decodeSourceCookie(value)).toEqual({
      source: "facebook",
      campaign: "oct promo:1",
    });
    expect(decodeSourceCookie(encodeSourceCookie("google", null))).toEqual({
      source: "google",
      campaign: null,
    });
  });

  it("rejects a tampered source", () => {
    expect(decodeSourceCookie("Not A Source")).toBeNull();
    expect(decodeSourceCookie(undefined)).toBeNull();
  });
});

describe("user agent", () => {
  it("skips crawlers and Facebook's link previews", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(
      true,
    );
    expect(isBotUserAgent(null)).toBe(true);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS]",
      ),
    ).toBe(false);
  });

  it("buckets devices", () => {
    expect(
      deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"),
    ).toBe("mobile");
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari",
      ),
    ).toBe("mobile");
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe(
      "tablet",
    );
    expect(
      deviceFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"),
    ).toBe("desktop");
  });
});
