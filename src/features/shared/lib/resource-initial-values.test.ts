import { describe, expect, it } from "vitest";

import { initialValuesFromSearchParams } from "@/features/shared/lib/resource-initial-values";

describe("initialValuesFromSearchParams", () => {
  const fields = [{ name: "vehicle_id" }, { name: "notes" }, { name: "photo", type: "image" as const }];

  it("keeps only the form's own fields", () => {
    expect(
      initialValuesFromSearchParams(fields, { vehicle_id: "v1", role: "owner", photo: "x.png" }),
    ).toEqual({ vehicle_id: "v1" });
  });

  it("takes the first of repeated params and drops blanks", () => {
    expect(initialValuesFromSearchParams(fields, { vehicle_id: ["v1", "v2"], notes: "  " })).toEqual({
      vehicle_id: "v1",
    });
  });
});
