import { describe, expect, it } from "vitest";

import { getTrackerConnectionStatus } from "./tracker-status";

const now = new Date("2026-07-13T08:00:00.000Z");

describe("getTrackerConnectionStatus", () => {
  it("returns unknown when no timestamp is available", () => {
    expect(getTrackerConnectionStatus(null, now)).toBe("unknown");
  });

  it("treats updates through five minutes old as online", () => {
    expect(getTrackerConnectionStatus("2026-07-13T07:55:00.000Z", now)).toBe(
      "online",
    );
  });

  it("treats updates between five and fifteen minutes old as delayed", () => {
    expect(getTrackerConnectionStatus("2026-07-13T07:50:00.000Z", now)).toBe(
      "delayed",
    );
  });

  it("treats updates older than fifteen minutes as offline", () => {
    expect(getTrackerConnectionStatus("2026-07-13T07:44:59.000Z", now)).toBe(
      "offline",
    );
  });

  it("does not label invalid or future timestamps as live", () => {
    expect(getTrackerConnectionStatus("invalid", now)).toBe("unknown");
    expect(getTrackerConnectionStatus("2026-07-13T08:01:00.000Z", now)).toBe(
      "unknown",
    );
  });
});
