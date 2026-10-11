import { describe, expect, it } from "vitest";

import {
  CAR_CALENDAR_PALETTE,
  assignCarColors,
  fallbackCarColor,
} from "@/features/vehicles/lib/calendar-color";

describe("assignCarColors", () => {
  it("keeps picked colours and gives the rest unused palette colours", () => {
    const colors = assignCarColors([
      { id: "a", calendarColor: CAR_CALENDAR_PALETTE[0] },
      { id: "b", calendarColor: null },
      { id: "c", calendarColor: "#ABCDEF" },
      { id: "d" },
    ]);
    expect(colors.get("a")).toBe(CAR_CALENDAR_PALETTE[0]);
    expect(colors.get("b")).toBe(CAR_CALENDAR_PALETTE[1]);
    expect(colors.get("c")).toBe("#abcdef");
    expect(colors.get("d")).toBe(CAR_CALENDAR_PALETTE[2]);
  });

  it("gives every car a distinct colour while the palette lasts", () => {
    const cars = CAR_CALENDAR_PALETTE.map((_, index) => ({ id: `car-${index}` }));
    expect(new Set(assignCarColors(cars).values()).size).toBe(cars.length);
  });

  it("falls back to a stable palette colour once it runs out", () => {
    const cars = [...CAR_CALENDAR_PALETTE, "extra"].map((_, index) => ({
      id: `car-${index}`,
    }));
    const extra = assignCarColors(cars).get(`car-${CAR_CALENDAR_PALETTE.length}`);
    expect(extra).toBe(fallbackCarColor(`car-${CAR_CALENDAR_PALETTE.length}`));
  });
});
