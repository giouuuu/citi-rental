import { describe, expect, it } from "vitest";

import {
  bookingContactHint,
  normalizePhone,
  parseBookingContact,
} from "@/features/booking/lib/booking-contact";

describe("normalizePhone", () => {
  it("collapses every PH mobile spelling to one canonical form", () => {
    for (const raw of [
      "09171234567",
      "0917 123 4567",
      "+63 917 123 4567",
      "639171234567",
      "9171234567",
      "(0917) 123-4567",
    ]) {
      expect(normalizePhone(raw)).toBe("+639171234567");
    }
  });

  it("keeps other numbers as +digits", () => {
    expect(normalizePhone("+1 (555) 010-9999")).toBe("+15550109999");
    expect(normalizePhone("032 123 4567")).toBe("+0321234567");
  });

  it("returns null when there are no digits", () => {
    expect(normalizePhone("  ")).toBeNull();
  });
});

describe("parseBookingContact", () => {
  it("accepts only a complete email", () => {
    expect(parseBookingContact(" Alice@Example.com ")).toEqual({
      kind: "email",
      value: "alice@example.com",
    });
    for (const partial of [
      "alice",
      "alice@",
      "alice@example",
      "alice@example.c",
    ]) {
      expect(parseBookingContact(partial)).toBeNull();
    }
  });

  it("accepts only a complete PH mobile", () => {
    expect(parseBookingContact("0917 123 4567")).toEqual({
      kind: "phone",
      value: "+639171234567",
    });
    for (const partial of ["0917", "0917123456", "+63917123"]) {
      expect(parseBookingContact(partial)).toBeNull();
    }
  });

  it("accepts an international number only with its + country code", () => {
    expect(parseBookingContact("+1 555 010 9999")).toEqual({
      kind: "phone",
      value: "+15550109999",
    });
    expect(parseBookingContact("15550109999")).toBeNull();
  });

  it("rejects text that is neither", () => {
    expect(parseBookingContact("call me maybe")).toBeNull();
    expect(parseBookingContact("")).toBeNull();
  });
});

describe("bookingContactHint", () => {
  it("nudges only while the input is incomplete", () => {
    expect(bookingContactHint("")).toBeNull();
    expect(bookingContactHint("alice@exa")).toMatch(/full email/);
    expect(bookingContactHint("0917")).toMatch(/full mobile/);
    expect(bookingContactHint("alice@example.com")).toBeNull();
  });
});
