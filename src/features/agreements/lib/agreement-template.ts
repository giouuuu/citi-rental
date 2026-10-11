/**
 * The rental agreement and policies the renter signs at release.
 *
 * DEFAULT_AGREEMENT_TEMPLATE is the company's paper agreement, with its
 * grammar and typos cleaned up and the amounts unchanged. Owners can replace
 * it in Settings (`company_profile.agreement_template`): edit any wording,
 * add or remove clauses, sections and their items.
 *
 * The rendered terms are frozen onto each signed agreement (`terms` jsonb),
 * so changing the template only changes agreements signed afterwards. Bump
 * AGREEMENT_TEMPLATE_VERSION whenever the built-in wording or an amount
 * changes; a saved template carries its own version.
 */
export const AGREEMENT_TEMPLATE_VERSION = "2026-10-v1";

/** Replaced with the free-cancellation window from Settings, e.g. "24 hours". */
export const HOURS_TOKEN = "{hours}";

export type AgreementFine = { label: string; amount: number };
export type AgreementLabeledItem = { label: string; text: string };

/** One removable part between the opening clauses and the signatures. */
export type AgreementSection =
  | {
      kind: "list";
      heading: string;
      intro: string;
      items: string[];
      closing: string;
    }
  | { kind: "fines"; heading: string; items: AgreementFine[] }
  | { kind: "labeled"; heading: string; items: AgreementLabeledItem[] };

export type AgreementSectionKind = AgreementSection["kind"];

/** A titled policy printed after the signatures: cancellation, extension… */
export type AgreementPolicy = {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
  closing: string;
};

/** What owners edit in Settings. */
export type AgreementTemplate = {
  title: string;
  intro: string;
  clauses: string[];
  sections: AgreementSection[];
  acknowledgement: string;
  cancellation: AgreementPolicy;
  /** More policies the owner added, printed after the cancellation policy. */
  policies: AgreementPolicy[];
};

/** The agreement as shown and signed: the template, filled in and versioned. */
export type AgreementTerms = AgreementTemplate & { version: string };

export const DEFAULT_AGREEMENT_TEMPLATE: AgreementTemplate = {
  title: "Car Rental Agreement",
  intro: "The renter hereby agrees to the terms and conditions stated in this form:",
  clauses: [
    "The renter states that they are over 18 years old, physically and legally qualified (with an unexpired driver's license) to operate the vehicle.",
    "The renter agrees that the unit is in good condition and free of any known defects or faults that would affect safe operation.",
    "The renter will use the unit for personal use only and operate the vehicle only on properly maintained roads and parking lots, in accordance with applicable law.",
    "The renter acknowledges that if the vehicle is involved in any traffic offense or accident, the renter agrees to be liable for any issues or payables imposed by the authorities or personnel involved.",
    "The renter agrees to indemnify, defend and hold the owner harmless for any loss, damage or legal action against the owner as a result of the renter's operation of the rented vehicle during the term of this agreement (e.g. attorney fees or penalties).",
    "Any lost item or equipment must be returned with the vehicle; otherwise, the value of the lost items must be paid.",
    "The renter shall be liable for any damage to or loss of the vehicle caused by their negligence or fault.",
    "The renter shall pay the daily rate of the unit for each day it is admitted for repairs or maintenance.",
    "The renter shall fully cooperate while the unit is under insurance approval. If the insurance claim is denied, the renter must shoulder the full cost of repairs.",
  ],
  sections: [
    {
      kind: "list",
      heading: "Penalties",
      intro:
        "The renter should not use the unit as follows, and will be held fully responsible for the following penalties:",
      items: [
        "Using the vehicle in a negligent manner or under the influence of alcohol or drugs",
        "Carrying passengers or property for hire — the vehicle is for personal use only",
        "Using the vehicle to push, propel or tow another vehicle or items",
        "Using the vehicle for racing or any competition",
      ],
      closing: "",
    },
    {
      kind: "fines",
      heading: "Fines",
      items: [
        { label: "Unlawful activities", amount: 10_000 },
        { label: "Overseas use / outside the island of Cebu", amount: 10_000 },
        { label: "Unauthorized repairs", amount: 10_000 },
        { label: "Any damage, dents or scratches (per panel)", amount: 4_500 },
        { label: "Smoking inside the car", amount: 2_000 },
      ],
    },
    {
      kind: "labeled",
      heading: "Other charges",
      items: [
        { label: "Car wash fee", text: "₱300" },
        {
          label: "Delivery fee",
          text: "Within Cebu City — ₱300 per way; outside Cebu City — ₱400 per way",
        },
      ],
    },
    {
      kind: "list",
      heading: "Prohibited use",
      intro:
        "The renter agrees not to use the vehicle for any unlawful activities, including but not limited to:",
      items: [
        "Transporting illegal substances or contraband",
        "Committing a crime or felony",
        "Engaging in any activity that may cause damage to the vehicle or put others at risk",
      ],
      closing:
        "If the renter uses the vehicle for any prohibited activity, the owner shall not be liable in any way for any consequences, damages or losses arising from such use. The renter shall indemnify and hold the owner harmless against any claims, demands or liabilities.",
    },
    {
      kind: "labeled",
      heading: "Additional reminders",
      items: [
        {
          label: "Fuel",
          text: "The renter shall return the vehicle with the same amount of fuel as at the start of the rental period; otherwise, an additional fee of ₱500 per bar will be collected.",
        },
        {
          label: "Excess hours (extension)",
          text: "The renter shall pay an additional fee for excess hours (Sedan: ₱250/hr; SUV: ₱300/hr).",
        },
      ],
    },
  ],
  acknowledgement:
    "By signing below, the parties acknowledge that they have read, understand, and agree to be bound by the terms and conditions of this Agreement.",
  cancellation: {
    title: "Car Rental Cancellation Policy",
    intro:
      "To ensure fair scheduling and availability for all customers, please review our cancellation policy before confirming your reservation.",
    sections: [
      {
        heading: `Cancellation within ${HOURS_TOKEN}`,
        body: `If the renter cancels the reservation on the day of the booking or within ${HOURS_TOKEN} before the scheduled booking date and time, the reservation fee/downpayment will be forfeited and non-refundable.`,
      },
      {
        heading: "No-show policy",
        body: "If the renter fails to show up at the agreed pickup date and time without prior notice, the reservation will be considered a no-show, and the reservation fee/downpayment will be forfeited and non-refundable.",
      },
      {
        heading: "Customer acknowledgment",
        body: "By confirming a reservation, the renter acknowledges and agrees to the terms of this cancellation policy.",
      },
    ],
    closing: "Thank you for your understanding and cooperation.",
  },
  policies: [],
};

/** An empty section of a kind, for "Add section" in Settings. */
export function emptyAgreementSection(kind: AgreementSectionKind): AgreementSection {
  if (kind === "fines") return { kind, heading: "", items: [{ label: "", amount: 0 }] };
  if (kind === "labeled") return { kind, heading: "", items: [{ label: "", text: "" }] };
  return { kind, heading: "", intro: "", items: [""], closing: "" };
}

/** An empty policy, for "Add policy" in Settings. */
export function emptyAgreementPolicy(): AgreementPolicy {
  return { title: "", intro: "", sections: [{ heading: "", body: "" }], closing: "" };
}

function hoursPhrase(hours: number) {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function fillHours<T>(value: T, hours: string): T {
  if (typeof value === "string") return value.replaceAll(HOURS_TOKEN, hours) as T;
  if (Array.isArray(value)) return value.map((item) => fillHours(item, hours)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillHours(item, hours)]),
    ) as T;
  }
  return value;
}

/**
 * The terms as signed. `freeCancellationHours` comes from Settings so the
 * printed policy always matches what the system enforces on cancellation.
 * Without a saved template, the built-in one is used.
 */
export function buildAgreementTerms({
  freeCancellationHours,
  template,
  version,
}: {
  freeCancellationHours: number;
  template?: AgreementTemplate | null;
  version?: string | null;
}): AgreementTerms {
  const source = template ?? DEFAULT_AGREEMENT_TEMPLATE;
  return {
    ...fillHours(structuredClone(source), hoursPhrase(freeCancellationHours)),
    version: (template && version) || AGREEMENT_TEMPLATE_VERSION,
  };
}

/** A version label for a template saved now; fits rentals.terms_version (40). */
export function newAgreementTemplateVersion(now = new Date()) {
  return `custom-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`;
}

type LegacyTerms = {
  version?: string;
  title: string;
  intro: string;
  clauses: string[];
  penalties: { heading: string; items: string[] };
  fines: AgreementFine[];
  otherCharges: { label: string; detail: string }[];
  prohibitedUse: { intro: string; items: string[]; closing: string };
  reminders: AgreementLabeledItem[];
  acknowledgement: string;
  cancellation: AgreementPolicy;
};

/**
 * Terms read back from a signed agreement. Agreements signed before the
 * template became editable stored fixed sections; they are rebuilt into
 * the section list without changing a word. Ones signed before policies
 * could be added have none beyond cancellation.
 */
export function normalizeAgreementTerms(raw: unknown): AgreementTerms {
  const terms = raw as AgreementTerms | LegacyTerms;
  if ("sections" in terms && Array.isArray(terms.sections)) {
    return Array.isArray(terms.policies) ? terms : { ...terms, policies: [] };
  }
  const legacy = terms as LegacyTerms;
  return {
    version: legacy.version ?? AGREEMENT_TEMPLATE_VERSION,
    title: legacy.title,
    intro: legacy.intro,
    clauses: legacy.clauses ?? [],
    sections: [
      {
        kind: "list",
        heading: "Penalties",
        intro: legacy.penalties?.heading ?? "",
        items: legacy.penalties?.items ?? [],
        closing: "",
      },
      { kind: "fines", heading: "Fines", items: legacy.fines ?? [] },
      {
        kind: "labeled",
        heading: "Other charges",
        items: (legacy.otherCharges ?? []).map((charge) => ({
          label: charge.label,
          text: charge.detail,
        })),
      },
      {
        kind: "list",
        heading: "Prohibited use",
        intro: legacy.prohibitedUse?.intro ?? "",
        items: legacy.prohibitedUse?.items ?? [],
        closing: legacy.prohibitedUse?.closing ?? "",
      },
      {
        kind: "labeled",
        heading: "Additional reminders",
        items: legacy.reminders ?? [],
      },
    ],
    acknowledgement: legacy.acknowledgement,
    cancellation: legacy.cancellation,
    policies: [],
  };
}

/** True when a section has nothing to print. Such sections are skipped. */
export function isEmptySection(section: AgreementSection) {
  if (section.kind === "list") {
    return !section.items.length && !section.intro.trim() && !section.closing.trim();
  }
  return !section.items.length;
}

/** True when a policy has nothing to print. Such policies are skipped. */
export function isEmptyPolicy(policy: AgreementPolicy) {
  return (
    !policy.sections.length &&
    !policy.title.trim() &&
    !policy.intro.trim() &&
    !policy.closing.trim()
  );
}
