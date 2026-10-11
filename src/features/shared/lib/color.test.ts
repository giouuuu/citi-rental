import { describe, expect, it } from "vitest";

import {
  hexToHsv,
  hsvToHex,
  normalizeHex,
  readableTextColor,
} from "@/features/shared/lib/color";

describe("normalizeHex", () => {
  it("expands short hex and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("2563EB")).toBe("#2563eb");
  });

  it("rejects anything that is not a hex colour", () => {
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("hsv round trip", () => {
  it("maps the wheel's corners", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 300, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvToHex({ h: 60, s: 1, v: 0 })).toBe("#000000");
  });

  it("returns to the same hex", () => {
    for (const hex of ["#2563eb", "#e11d48", "#92400e", "#808080"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });
});

describe("readableTextColor", () => {
  it("puts dark text on light colours and white on dark ones", () => {
    expect(readableTextColor("#fde047")).toBe("#111827");
    expect(readableTextColor("#ffffff")).toBe("#111827");
    expect(readableTextColor("#1e3a8a")).toBe("#ffffff");
    expect(readableTextColor("#7c3aed")).toBe("#ffffff");
  });
});
