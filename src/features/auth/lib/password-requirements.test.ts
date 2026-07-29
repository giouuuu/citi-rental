import { describe, expect, it } from "vitest";

import { evaluatePasswordRequirements } from "./password-requirements";

describe("evaluatePasswordRequirements", () => {
  it("marks all requirements unmet for an empty password", () => {
    expect(evaluatePasswordRequirements("").map((item) => item.met)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("updates each requirement independently", () => {
    expect(evaluatePasswordRequirements("short").map((item) => item.met)).toEqual([
      false,
      true,
      false,
    ]);
    expect(evaluatePasswordRequirements("fleetpass1").map((item) => item.met)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
