import { buildAgreementTerms } from "@/features/agreements/lib/agreement-template";

/** Where the business brings the car. Used in copy across the public site. */
export const DELIVERY_AREA = "anywhere in Cebu province";

/**
 * The delivery fee from the rental agreement renters sign, phrased to read
 * mid-sentence ("within Cebu City — ₱300 per way; …"). Null if the agreement
 * ever drops the charge.
 */
export function agreementDeliveryFee(): string | null {
  // The cancellation window only shapes the policy text, not the charges.
  const terms = buildAgreementTerms({ freeCancellationHours: 0 });
  const detail = terms.otherCharges.find((charge) =>
    /delivery/i.test(charge.label),
  )?.detail;
  return detail ? detail.charAt(0).toLowerCase() + detail.slice(1) : null;
}

/**
 * The lowest per-way delivery fee in the rental agreement (the Cebu City
 * rate), as a number for headline figures. Null if the agreement ever drops
 * the charge or stops stating it in pesos.
 */
export function agreementDeliveryFromAmount(): number | null {
  const fee = agreementDeliveryFee();
  const amounts = [...(fee?.matchAll(/₱\s?([\d,]+)/g) ?? [])]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  return amounts.length ? Math.min(...amounts) : null;
}
