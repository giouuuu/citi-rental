import { describe, expect, it } from "vitest";

import { formatDuration } from "./format-duration";

const at = (value: string) => new Date(`${value}:00+08:00`);

describe("formatDuration", () => {
  it("spells out days and hours", () => {
    expect(formatDuration(at("2026-10-01T09:00"), at("2026-10-05T08:00"))).toBe("3 days 23 hours");
  });

  it("drops zero parts", () => {
    expect(formatDuration(at("2026-10-01T09:00"), at("2026-10-09T09:00"))).toBe("8 days");
    expect(formatDuration(at("2026-10-01T09:00"), at("2026-10-01T18:00"))).toBe("9 hours");
    expect(formatDuration(at("2026-10-01T09:00"), at("2026-10-02T09:30"))).toBe("1 day 30 min");
  });

  it("is null when the return is not after the start", () => {
    expect(formatDuration(at("2026-10-01T09:00"), at("2026-10-01T09:00"))).toBeNull();
    expect(formatDuration(at("2026-10-02T09:00"), at("2026-10-01T09:00"))).toBeNull();
  });
});
