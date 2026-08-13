import { describe, expect, it } from "vitest";

import { resourceEmptyCopy } from "@/features/shared/lib/resource-empty-copy";

describe("resourceEmptyCopy", () => {
  it("offers a create path when nothing exists yet", () => {
    const copy = resourceEmptyCopy({
      plural: "Vehicles",
      query: "",
      singular: "Vehicle",
    });
    expect(copy.isFiltered).toBe(false);
    expect(copy.title).toBe("No vehicles yet");
    expect(copy.description).toContain("first vehicle");
  });

  it("names the search term back when a filter is active", () => {
    const copy = resourceEmptyCopy({
      plural: "Vehicles",
      query: "honda",
      singular: "Vehicle",
    });
    expect(copy.isFiltered).toBe(true);
    expect(copy.title).toBe("No vehicles match your search.");
    expect(copy.description).toContain("honda");
  });

  it("treats a whitespace-only query as no filter", () => {
    expect(
      resourceEmptyCopy({ plural: "Vehicles", query: "   ", singular: "Vehicle" })
        .isFiltered,
    ).toBe(false);
  });

  it("trims the term it echoes back", () => {
    expect(
      resourceEmptyCopy({
        plural: "Customers",
        query: "  ana  ",
        singular: "Customer",
      }).description,
    ).toContain("“ana”");
  });
});
