import { describe, expect, it } from "vitest";

import {
  addDaysToKey,
  daysBetweenKeys,
  formatDateKey,
  manilaDateKey,
  manilaDateTimeInput,
  manilaDayEnd,
  manilaDayStart,
  parseDateKey,
  parseManilaDateTimeInput,
  parseManilaTimestamp,
  toManilaDateTimeInput,
} from "./manila-time";

describe("manila-time", () => {
  it("rolls to the next Manila day at 16:00 UTC", () => {
    expect(manilaDateKey(new Date("2026-09-29T15:59:59Z"))).toBe("2026-09-29");
    expect(manilaDateKey(new Date("2026-09-29T16:00:00Z"))).toBe("2026-09-30");
  });

  it("puts Manila midnight at 16:00 UTC the previous day", () => {
    expect(manilaDayStart("2026-09-30").toISOString()).toBe("2026-09-29T16:00:00.000Z");
    expect(manilaDayEnd("2026-09-30").toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-9-1")).toBeNull();
    expect(parseDateKey(undefined)).toBeNull();
    expect(parseDateKey("2026-02-28")).toBe("2026-02-28");
  });

  it("does key arithmetic across month and year ends", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetweenKeys("2026-09-01", "2026-09-30")).toBe(30);
    expect(daysBetweenKeys("2026-09-01", "2026-09-01")).toBe(1);
  });

  it("formats a key without a local-zone shift", () => {
    expect(formatDateKey("2026-01-01", "long")).toBe("Jan 1, 2026");
  });
});

describe("Manila picker values", () => {
  it("shows an instant in Manila wall-clock time", () => {
    expect(manilaDateTimeInput(new Date("2026-10-09T17:30:00.000Z"))).toBe("2026-10-10T01:30");
  });

  it("reads a picker value as Manila time", () => {
    expect(parseManilaDateTimeInput("2026-10-10T01:30")?.toISOString()).toBe(
      "2026-10-09T17:30:00.000Z",
    );
  });

  it("rejects malformed values", () => {
    expect(parseManilaDateTimeInput("2026-10-10")).toBeNull();
    expect(parseManilaDateTimeInput("2026-02-30T10:00")).toBeNull();
    expect(parseManilaDateTimeInput("2026-10-10T25:00")).toBeNull();
  });

  it("shows a stored UTC timestamp as Manila wall-clock for pickers", () => {
    expect(toManilaDateTimeInput("2026-10-07 16:00:00+00")).toBe("2026-10-08T00:00");
    expect(toManilaDateTimeInput("2026-10-09T10:00:00+00:00")).toBe("2026-10-09T18:00");
    expect(toManilaDateTimeInput("2026-10-08T00:00")).toBe("2026-10-08T00:00");
    expect(toManilaDateTimeInput("")).toBe("");
  });

  it("saves picker values as Manila time and keeps stored offsets", () => {
    expect(parseManilaTimestamp("2026-10-08T00:00")?.toISOString()).toBe("2026-10-07T16:00:00.000Z");
    expect(parseManilaTimestamp("2026-10-07T16:00:00+00:00")?.toISOString()).toBe("2026-10-07T16:00:00.000Z");
    expect(parseManilaTimestamp("nope")).toBeNull();
  });
});
