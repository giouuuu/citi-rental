import { describe, expect, it } from "vitest";

import { vehicleModelLine } from "@/features/vehicles/lib/vehicle-model-line";

describe("vehicleModelLine", () => {
  it("joins year, make and model", () => {
    expect(vehicleModelLine({ make: "Toyota", model: "Avanza", year: 2026 })).toBe(
      "2026 Toyota Avanza",
    );
  });

  it("skips placeholder make and model", () => {
    expect(vehicleModelLine({ make: "NA", model: "n/a", year: 2026 })).toBe("2026 model");
  });

  it("returns null when nothing real is left", () => {
    expect(vehicleModelLine({ make: "NA", model: "NA", year: 0 })).toBeNull();
    expect(vehicleModelLine({ make: "", model: " ", year: null })).toBeNull();
  });

  it("keeps make and model without a year", () => {
    expect(vehicleModelLine({ make: "Toyota", model: "Vios", year: null })).toBe("Toyota Vios");
  });
});
