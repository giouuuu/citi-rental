import { describe, expect, it } from "vitest";

import {
  dayHolds,
  firstClash,
  wallClockDateKey,
  wallClockTime,
} from "./booked-days";

describe("wallClockDateKey / wallClockTime", () => {
  it("reads typed and stored timestamps as written", () => {
    expect(wallClockDateKey("2026-10-05T09:00")).toBe("2026-10-05");
    expect(wallClockDateKey("2026-10-05T22:30:00+00:00")).toBe("2026-10-05");
    expect(wallClockTime("2026-10-05T22:30:00+00:00")).toBe("22:30");
  });

  it("rejects empty and malformed values", () => {
    expect(wallClockDateKey("")).toBeNull();
    expect(wallClockDateKey("2026-02-30T09:00")).toBeNull();
    expect(wallClockTime("2026-10-05")).toBe("");
  });
});

describe("dayHolds", () => {
  it("leaves a return day free from the time the car is back", () => {
    // Out Oct 15 9:00 AM, back Oct 18 7:00 AM.
    const holds = dayHolds([{ startAt: "2026-10-15T09:00", endAt: "2026-10-18T07:00" }]);
    expect(holds.get("2026-10-15")).toMatchObject({ full: false, freeFrom: null, freeUntil: "09:00" });
    expect(holds.get("2026-10-16")?.full).toBe(true);
    expect(holds.get("2026-10-17")?.full).toBe(true);
    expect(holds.get("2026-10-18")).toMatchObject({ full: false, freeFrom: "07:00", freeUntil: null });
  });

  it("ignores a day a booking only reaches at midnight", () => {
    const holds = dayHolds([{ startAt: "2026-10-05T09:00", endAt: "2026-10-07T00:00" }]);
    expect([...holds.keys()]).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("joins bookings that share a day", () => {
    const first = { startAt: "2026-10-05T09:00", endAt: "2026-10-06T09:00", label: "A" };
    const second = { startAt: "2026-10-06T13:00", endAt: "2026-10-07T09:00", label: "B" };
    expect(dayHolds([first, second]).get("2026-10-06")).toEqual({
      ranges: [first, second],
      full: false,
      freeFrom: null,
      freeUntil: null,
    });
    // Back to back: the turnover day is taken all day.
    const third = { startAt: "2026-10-07T09:00", endAt: "2026-10-08T09:00" };
    expect(dayHolds([second, third]).get("2026-10-07")).toMatchObject({ full: true });
  });

  it("reads stored timestamps and skips inverted and unreadable ranges", () => {
    expect(dayHolds([{ startAt: "2026-10-05T22:30:00+00:00", endAt: "2026-10-06T08:00:00+00:00" }]).get("2026-10-05"))
      .toMatchObject({ freeUntil: "22:30" });
    expect(dayHolds([{ startAt: "2026-10-08T09:00", endAt: "2026-10-05T09:00" }]).size).toBe(0);
    expect(dayHolds([{ startAt: "", endAt: "2026-10-05T09:00" }]).size).toBe(0);
  });
});

describe("firstClash", () => {
  const booking = { startAt: "2026-10-15T09:00", endAt: "2026-10-18T07:00", label: "A" };

  it("lets a trip start the moment the car is back", () => {
    expect(firstClash([booking], "2026-10-18T07:00", "2026-10-20T09:00")).toBeNull();
    expect(firstClash([booking], "2026-10-18T10:00", "2026-10-20T09:00")).toBeNull();
  });

  it("lets a trip end before the car goes out", () => {
    expect(firstClash([booking], "2026-10-13T09:00", "2026-10-15T09:00")).toBeNull();
  });

  it("finds a trip that overlaps the booking", () => {
    expect(firstClash([booking], "2026-10-18T06:00", "2026-10-20T09:00")).toBe(booking);
    expect(firstClash([booking], "2026-10-12T09:00", "2026-10-22T09:00")).toBe(booking);
  });

  it("is null for an unfinished or inverted trip", () => {
    expect(firstClash([booking], "2026-10-16T09:00", "")).toBeNull();
    expect(firstClash([booking], "2026-10-17T09:00", "2026-10-16T09:00")).toBeNull();
  });
});
