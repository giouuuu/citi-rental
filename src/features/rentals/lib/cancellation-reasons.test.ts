import { describe, expect, it } from "vitest";

import { CANCELLATION_REASON_VALUES, cancellationReasonLabel } from "./cancellation-reasons";

describe("cancellation reasons", () => {
  it("matches the database check list exactly", () => {
    expect(CANCELLATION_REASON_VALUES).toEqual([
      "customer_request",
      "no_show",
      "payment_not_received",
      "vehicle_unavailable",
      "duplicate",
      "other",
    ]);
  });

  it("labels known reasons and ignores unknown ones", () => {
    expect(cancellationReasonLabel("no_show")).toBe("Customer did not show up");
    expect(cancellationReasonLabel("bogus")).toBeNull();
    expect(cancellationReasonLabel(null)).toBeNull();
  });
});
