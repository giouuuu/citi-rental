/**
 * The rental agreement and cancellation policy the renter signs at release —
 * the company's paper agreement, with its grammar and typos cleaned up and
 * the amounts unchanged.
 *
 * The rendered terms are frozen onto each signed agreement (`terms` jsonb),
 * so editing this file only changes agreements signed afterwards. Bump the
 * version whenever the wording or an amount changes.
 */
export const AGREEMENT_TEMPLATE_VERSION = "2026-10-v1";

export type AgreementFine = { label: string; amount: number };

export type AgreementTerms = {
  version: string;
  title: string;
  intro: string;
  clauses: string[];
  penalties: { heading: string; items: string[] };
  fines: AgreementFine[];
  otherCharges: { label: string; detail: string }[];
  prohibitedUse: { intro: string; items: string[]; closing: string };
  reminders: { label: string; text: string }[];
  acknowledgement: string;
  cancellation: {
    title: string;
    intro: string;
    sections: { heading: string; body: string }[];
    closing: string;
  };
};

function hoursPhrase(hours: number) {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * The terms as signed. `freeCancellationHours` comes from Settings so the
 * printed policy always matches what the system enforces on cancellation.
 */
export function buildAgreementTerms({
  freeCancellationHours,
}: {
  freeCancellationHours: number;
}): AgreementTerms {
  const window = hoursPhrase(freeCancellationHours);
  return {
    version: AGREEMENT_TEMPLATE_VERSION,
    title: "Car Rental Agreement",
    intro:
      "The renter hereby agrees to the terms and conditions stated in this form:",
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
    penalties: {
      heading:
        "The renter should not use the unit as follows, and will be held fully responsible for the following penalties:",
      items: [
        "Using the vehicle in a negligent manner or under the influence of alcohol or drugs",
        "Carrying passengers or property for hire — the vehicle is for personal use only",
        "Using the vehicle to push, propel or tow another vehicle or items",
        "Using the vehicle for racing or any competition",
      ],
    },
    fines: [
      { label: "Unlawful activities", amount: 10_000 },
      { label: "Overseas use / outside the island of Cebu", amount: 10_000 },
      { label: "Unauthorized repairs", amount: 10_000 },
      { label: "Any damage, dents or scratches (per panel)", amount: 4_500 },
      { label: "Smoking inside the car", amount: 2_000 },
    ],
    otherCharges: [
      { label: "Car wash fee", detail: "₱300" },
      {
        label: "Delivery fee",
        detail: "Within Cebu City — ₱300 per way; outside Cebu City — ₱400 per way",
      },
    ],
    prohibitedUse: {
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
    reminders: [
      {
        label: "Fuel",
        text: "The renter shall return the vehicle with the same amount of fuel as at the start of the rental period; otherwise, an additional fee of ₱500 per bar will be collected.",
      },
      {
        label: "Excess hours (extension)",
        text: "The renter shall pay an additional fee for excess hours (Sedan: ₱250/hr; SUV: ₱300/hr).",
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
          heading: `Cancellation within ${window}`,
          body: `If the renter cancels the reservation on the day of the booking or within ${window} before the scheduled booking date and time, the reservation fee/downpayment will be forfeited and non-refundable.`,
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
  };
}
