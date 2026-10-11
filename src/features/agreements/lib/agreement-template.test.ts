import { describe, expect, it } from "vitest";

import {
  AGREEMENT_TEMPLATE_VERSION,
  type AgreementTemplate,
  buildAgreementTerms,
  DEFAULT_AGREEMENT_TEMPLATE,
  HOURS_TOKEN,
  normalizeAgreementTerms,
} from "@/features/agreements/lib/agreement-template";
import {
  agreementTemplateSchema,
  parseAgreementTemplate,
} from "@/features/agreements/schemas/agreement-template-schema";

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
    const fines = terms.sections.find((section) => section.kind === "fines");
    expect(fines?.kind === "fines" && fines.items.map((fine) => fine.amount)).toEqual([
      10_000, 10_000, 10_000, 4_500, 2_000,
    ]);
  });

  it("says hour, not hours, for a one-hour window", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 1 });
    expect(terms.cancellation.sections[0]!.heading).toBe("Cancellation within 1 hour");
  });

  it("uses a saved template and its version", () => {
    const template: AgreementTemplate = {
      ...DEFAULT_AGREEMENT_TEMPLATE,
      clauses: ["Only one clause."],
      sections: [
        { kind: "labeled", heading: "Insurance", items: [{ label: "Excess", text: "₱5,000 within {hours}" }] },
      ],
    };
    const terms = buildAgreementTerms({
      freeCancellationHours: 12,
      template,
      version: "custom-20261011T080000Z",
    });
    expect(terms.version).toBe("custom-20261011T080000Z");
    expect(terms.clauses).toEqual(["Only one clause."]);
    expect(terms.sections).toEqual([
      { kind: "labeled", heading: "Insurance", items: [{ label: "Excess", text: "₱5,000 within 12 hours" }] },
    ]);
    // The saved template itself is untouched.
    expect(template.sections[0]).toMatchObject({ items: [{ text: "₱5,000 within {hours}" }] });
  });

  it("falls back to the built-in version without a saved template", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 24, version: "custom-x" });
    expect(terms.version).toBe(AGREEMENT_TEMPLATE_VERSION);
  });
});

describe("agreementTemplateSchema", () => {
  it("accepts the built-in template", () => {
    expect(agreementTemplateSchema.safeParse(DEFAULT_AGREEMENT_TEMPLATE).success).toBe(true);
  });

  it("rejects a blank item", () => {
    const result = agreementTemplateSchema.safeParse({
      ...DEFAULT_AGREEMENT_TEMPLATE,
      clauses: ["Fine", "  "],
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeAgreementTerms", () => {
  it("rebuilds an agreement signed with the fixed sections", () => {
    const legacy = {
      version: "2026-10-v1",
      title: "Car Rental Agreement",
      intro: "Intro",
      clauses: ["A"],
      penalties: { heading: "Do not:", items: ["Race"] },
      fines: [{ label: "Smoking", amount: 2000 }],
      otherCharges: [{ label: "Car wash fee", detail: "₱300" }],
      prohibitedUse: { intro: "No", items: ["Crime"], closing: "End" },
      reminders: [{ label: "Fuel", text: "Same level" }],
      acknowledgement: "Ack",
      cancellation: { title: "Policy", intro: "", sections: [], closing: "" },
    };
    const terms = normalizeAgreementTerms(legacy);
    expect(terms.sections.map((section) => section.heading)).toEqual([
      "Penalties",
      "Fines",
      "Other charges",
      "Prohibited use",
      "Additional reminders",
    ]);
    expect(terms.sections[2]).toEqual({
      kind: "labeled",
      heading: "Other charges",
      items: [{ label: "Car wash fee", text: "₱300" }],
    });
  });

  it("leaves current terms alone", () => {
    const terms = buildAgreementTerms({ freeCancellationHours: 24 });
    expect(normalizeAgreementTerms(terms)).toBe(terms);
  });

  it("gives terms signed before added policies an empty list", () => {
    const signed = { ...buildAgreementTerms({ freeCancellationHours: 24 }), policies: undefined };
    expect(normalizeAgreementTerms(signed).policies).toEqual([]);
  });
});

describe("added policies", () => {
  it("fill in the cancellation window like the cancellation policy", () => {
    const terms = buildAgreementTerms({
      freeCancellationHours: 12,
      template: {
        ...DEFAULT_AGREEMENT_TEMPLATE,
        policies: [
          {
            title: "Rental Extension Policy",
            intro: "",
            sections: [{ heading: "Notice", body: `Tell us ${HOURS_TOKEN} ahead.` }],
            closing: "",
          },
        ],
      },
    });
    expect(terms.policies[0]!.sections[0]!.body).toBe("Tell us 12 hours ahead.");
  });

  it("default to none on templates saved before they existed", () => {
    const saved = { ...DEFAULT_AGREEMENT_TEMPLATE, policies: undefined };
    expect(parseAgreementTemplate(saved)?.policies).toEqual([]);
  });

  it("need a title", () => {
    const template = {
      ...DEFAULT_AGREEMENT_TEMPLATE,
      policies: [
        { title: " ", intro: "", sections: [{ heading: "Notice", body: "Call us." }], closing: "" },
      ],
    };
    expect(parseAgreementTemplate(template)).toBeNull();
  });
});
