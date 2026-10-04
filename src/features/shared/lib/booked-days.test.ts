import { describe, expect, it } from "vitest";

import {
  bookedDays,
  firstBookedDayBetween,
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

describe("bookedDays", () => {
  it("blocks every day from pick-up through return", () => {
    const range = { startAt: "2026-10-05T09:00:00+00:00", endAt: "2026-10-08T09:00:00+00:00" };
    expect([...bookedDays([range]).keys()]).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
  });

  it("keeps every booking that touches a shared day", () => {
    const first = { startAt: "2026-10-05T09:00", endAt: "2026-10-06T09:00", label: "A" };
    const second = { startAt: "2026-10-06T13:00", endAt: "2026-10-07T09:00", label: "B" };
    expect(bookedDays([first, second]).get("2026-10-06")).toEqual([first, second]);
  });

  it("skips inverted and unreadable ranges", () => {
    expect(bookedDays([{ startAt: "2026-10-08T09:00", endAt: "2026-10-05T09:00" }]).size).toBe(0);
    expect(bookedDays([{ startAt: "", endAt: "2026-10-05T09:00" }]).size).toBe(0);
  });
});

describe("firstBookedDayBetween", () => {
  const booked = bookedDays([{ startAt: "2026-10-10T09:00", endAt: "2026-10-11T09:00" }]);

  it("finds the first blocker inside the stretch", () => {
    expect(firstBookedDayBetween("2026-10-08", "2026-10-12", booked)).toBe("2026-10-10");
  });

  it("returns null for a clear stretch", () => {
    expect(firstBookedDayBetween("2026-10-01", "2026-10-09", booked)).toBeNull();
  });
});
