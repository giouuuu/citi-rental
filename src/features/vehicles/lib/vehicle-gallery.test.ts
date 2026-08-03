import { describe, expect, it } from "vitest";
import {
  isCompleteVehicleGallery,
  missingVehicleGalleryLabels,
} from "./vehicle-gallery";

describe("vehicle gallery helpers", () => {
  it("requires all 6 kinds", () => {
    expect(isCompleteVehicleGallery([{ kind: "front" }])).toBe(false);
    expect(
      isCompleteVehicleGallery([
        { kind: "front" },
        { kind: "rear" },
        { kind: "left" },
        { kind: "right" },
        { kind: "interior" },
        { kind: "dashboard" },
      ]),
    ).toBe(true);
  });

  it("lists missing labels", () => {
    expect(missingVehicleGalleryLabels([{ kind: "front" }])).toEqual([
      "Rear",
      "Left side",
      "Right side",
      "Interior",
      "Dashboard",
    ]);
  });
});
