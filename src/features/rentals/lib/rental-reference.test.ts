import { describe, expect, it } from "vitest";

import { suggestRentalReference } from "./rental-reference";

describe("suggestRentalReference", () => {
  it("uses the Manila date and six random characters", () => {
    // 20:00 UTC on Oct 9 is already Oct 10 in Manila.
    expect(
      suggestRentalReference(
        new Date("2026-10-09T20:00:00.000Z"),
        "a1b2c3d4-0000-4000-8000-000000000000",
      ),
    ).toBe("RNT-261010-A1B2C3");
  });
});
