import { describe, expect, it } from "vitest";

import {
  AGREEMENT_TEMPLATE_VERSION,
  buildAgreementTerms,
} from "@/features/agreements/lib/agreement-template";

describe("buildAgreementTerms", () => {
  it("prints the cancellation window from Settings", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 48 });
    expect(terms.cancellation.sections[0]!.heading).toBe(
      "Cancellation within 48 hours",
    );
    expect(terms.cancellation.sections[0]!.body).toContain("within 48 hours before");
  });

  it("keeps the paper agreement's fines and version", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 24 });
    expect(terms.version).toBe(AGREEMENT_TEMPLATE_VERSION);
    expect(terms.fines.map((fine) => fine.amount)).toEqual([
      10_000, 10_000, 10_000, 4_500, 2_000,
    ]);
  });

  it("says hour, not hours, for a one-hour window", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 1 });
    expect(terms.cancellation.sections[0]!.heading).toBe("Cancellation within 1 hour");
  });
});
