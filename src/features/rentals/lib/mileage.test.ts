import { describe, expect, it } from "vitest";
import { formatKm, kmDriven, summarizeMileage } from "./mileage";

describe("kmDriven", () => {
  it("is the return reading less the release reading", () => {
    expect(kmDriven(45210, 45682.5)).toBe(472.5);
  });

  it("is null until both readings exist", () => {
    expect(kmDriven(45210, null)).toBeNull();
    expect(kmDriven(null, 45682)).toBeNull();
  });
});

describe("formatKm", () => {
  it("groups thousands and keeps one decimal", () => {
    expect(formatKm(1234)).toBe("1,234 km");
    expect(formatKm(472.5)).toBe("472.5 km");
    expect(formatKm(null)).toBe("—");
  });
});

describe("summarizeMileage", () => {
  it("totals and averages only trips with both readings", () => {
    expect(summarizeMileage([120, null, 380.5, undefined])).toEqual({
      totalKm: 500.5,
      trips: 2,
      averageKm: 250.3,
    });
  });

  it("has no average without trips", () => {
    expect(summarizeMileage([null])).toEqual({ totalKm: 0, trips: 0, averageKm: null });
  });
});
