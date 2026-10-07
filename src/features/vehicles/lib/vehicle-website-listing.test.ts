import { describe, expect, it } from "vitest";
import { websiteListingBlockers } from "./vehicle-website-listing";

const fullGallery = ["front", "rear", "left", "right", "interior", "dashboard"].map(
  (kind) => ({ kind }),
);

describe("websiteListingBlockers", () => {
  it("lists an available car with a full gallery", () => {
    expect(
      websiteListingBlockers({ vehicleId: "v1", status: "available", photos: fullGallery, siteOn: true }),
    ).toEqual([]);
  });

  it("explains every reason a car is hidden", () => {
    const blockers = websiteListingBlockers({
      vehicleId: "v1",
      status: "maintenance",
      photos: [{ kind: "front" }],
      siteOn: false,
    });
    expect(blockers.map((blocker) => blocker.title)).toEqual([
      "Website booking is off",
      "In maintenance",
      "5 required photos missing",
    ]);
    expect(blockers[2]?.fix?.href).toBe("/vehicles/v1?tab=photos");
  });

  it("names an archived car", () => {
    const [blocker] = websiteListingBlockers({
      vehicleId: "v1",
      status: "inactive",
      photos: fullGallery,
      siteOn: true,
    });
    expect(blocker?.title).toBe("Archived");
  });
});
