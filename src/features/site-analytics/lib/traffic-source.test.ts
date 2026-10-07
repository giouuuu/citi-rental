import { describe, expect, it } from "vitest";

import { detectTrafficSource, normalizeSource } from "./traffic-source";

const ownHost = "zekecebucarrental.com";

describe("detectTrafficSource", () => {
  it("reads a bare ?fb tag as Facebook", () => {
    expect(detectTrafficSource({ search: "?fb", ownHost })).toEqual({
      source: "facebook",
      campaign: null,
      referrerHost: null,
    });
  });

  it("names the post from ?fb=<tag>", () => {
    expect(detectTrafficSource({ search: "fb=oct-promo", ownHost })?.campaign).toBe("oct-promo");
  });

  it("prefers an explicit tag over the referrer", () => {
    expect(
      detectTrafficSource({ search: "?ig", referrer: "https://l.facebook.com/", ownHost }),
    ).toMatchObject({ source: "instagram", referrerHost: "l.facebook.com" });
  });

  it("reads utm_source and src", () => {
    expect(detectTrafficSource({ search: "?utm_source=FB&utm_campaign=sale", ownHost })).toEqual({
      source: "facebook",
      campaign: "sale",
      referrerHost: null,
    });
    expect(detectTrafficSource({ search: "?src=flyer", ownHost })?.source).toBe("flyer");
  });

  it("credits Facebook's fbclid even without a tag", () => {
    expect(detectTrafficSource({ search: "?fbclid=abc123", ownHost })?.source).toBe("facebook");
  });

  it("maps referrer hosts", () => {
    expect(
      detectTrafficSource({ search: "", referrer: "https://m.facebook.com/story", ownHost })?.source,
    ).toBe("facebook");
    expect(
      detectTrafficSource({ search: "", referrer: "https://www.google.com.ph/", ownHost })?.source,
    ).toBe("google");
    expect(
      detectTrafficSource({ search: "", referrer: "https://blog.example.com/x", ownHost })?.source,
    ).toBe("blog.example.com");
  });

  it("treats internal pages and sign-in / payment hops as direct", () => {
    for (const referrer of [
      "https://zekecebucarrental.com/book/x",
      "https://www.zekecebucarrental.com/",
      "https://accounts.google.com/o/oauth2",
      "https://abc.supabase.co/auth/v1/callback",
      "https://checkout.paymongo.com/cs_123",
    ]) {
      expect(detectTrafficSource({ search: "", referrer, ownHost })).toBeNull();
    }
  });

  it("does not mistake the booking ?ref= for a source", () => {
    expect(detectTrafficSource({ search: "?ref=ZK-0012", ownHost })).toBeNull();
  });

  it("is direct with nothing to go on", () => {
    expect(detectTrafficSource({ search: "", referrer: "", ownHost })).toBeNull();
  });
});

describe("normalizeSource", () => {
  it("lowercases, strips www and folds aliases", () => {
    expect(normalizeSource("Facebook")).toBe("facebook");
    expect(normalizeSource("www.Instagram.com")).toBe("instagram");
    expect(normalizeSource("Summer Flyer!")).toBe("summer-flyer");
    expect(normalizeSource("  ")).toBeNull();
  });
});
