import { describe, expect, it } from "vitest";

import { vehicleListingTitle, vehicleSeoTitle } from "./vehicle-title";

describe("vehicleSeoTitle", () => {
  it("leads with the make unless it is a placeholder", () => {
    expect(vehicleSeoTitle({ name: "Vios Automatic", make: "Toyota" })).toBe("Toyota Vios Automatic");
    expect(vehicleSeoTitle({ name: "Vios Automatic", make: "NA" })).toBe("Vios Automatic");
  });
});

describe("vehicleListingTitle", () => {
  it("tells two cars of one name apart by colour and year", () => {
    const red = vehicleListingTitle({ name: "Vios Automatic", make: "NA", color: "Red", year: 2027 });
    const blue = vehicleListingTitle({ name: "Vios Automatic", make: "NA", color: "Blue", year: 2026 });
    expect(red).toBe("Vios Automatic (Red, 2027)");
    expect(blue).toBe("Vios Automatic (Blue, 2026)");
  });

  it("skips a colour the name already says, and blanks", () => {
    expect(vehicleListingTitle({ name: "Vios Red", make: "Toyota", color: "red", year: 2027 })).toBe(
      "Toyota Vios Red (2027)",
    );
    expect(vehicleListingTitle({ name: "Avanza", make: "Toyota", color: "N/A", year: null })).toBe(
      "Toyota Avanza",
    );
  });
});
