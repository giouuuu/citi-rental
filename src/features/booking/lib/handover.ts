import { formatPhp } from "@/features/shared/lib/money";

/**
 * How the car changes hands at each end of the trip: at the office (free), or
 * delivered / collected within or outside Cebu City at a per-way fee from
 * Settings. Same values as rentals.pickup_method / return_method.
 */
export const HANDOVER_METHODS = ["office", "within_city", "outside_city"] as const;

export type HandoverMethod = (typeof HANDOVER_METHODS)[number];

export type HandoverLeg = "pickup" | "return";

/** Settings → per-way delivery fees. Null: staff quote it. */
export type DeliveryFees = {
  withinCity: number | null;
  outsideCity: number | null;
};

export function parseHandoverMethod(value: unknown): HandoverMethod | null {
  return HANDOVER_METHODS.find((method) => method === value) ?? null;
}

/** One leg's fee. Mirrors private.delivery_fee: the office and unset rates are 0. */
export function deliveryFee(
  method: HandoverMethod | null | undefined,
  fees: DeliveryFees | null | undefined,
): number {
  if (method === "within_city") return fees?.withinCity ?? 0;
  if (method === "outside_city") return fees?.outsideCity ?? 0;
  return 0;
}

/** The per-way rate for a method; null at the office or when staff quote it. */
export function deliveryRate(
  method: HandoverMethod,
  fees: DeliveryFees | null | undefined,
): number | null {
  if (method === "within_city") return fees?.withinCity ?? null;
  if (method === "outside_city") return fees?.outsideCity ?? null;
  return null;
}

const copy = {
  pickup: {
    office: "Pick up at our office",
    within_city: "Deliver within Cebu City",
    outside_city: "Deliver outside Cebu City",
    bill: { office: "Pick-up at office", delivered: "Delivery" },
  },
  return: {
    office: "Return to our office",
    within_city: "Collect within Cebu City",
    outside_city: "Collect outside Cebu City",
    bill: { office: "Return at office", delivered: "Collection" },
  },
} as const;

/** The choice as the customer picks it: "Deliver within Cebu City". */
export function handoverLabel(leg: HandoverLeg, method: HandoverMethod) {
  return copy[leg][method];
}

const shortCopy = {
  office: "Our office",
  within_city: "Cebu City",
  outside_city: "Outside Cebu City",
} as const;

/** The choice in a three-across picker, where the legend names the leg. */
export function handoverShortLabel(method: HandoverMethod) {
  return shortCopy[method];
}

/** What the choice costs, for the picker: "Free", "₱300 per way", "Fee confirmed by staff". */
export function handoverPrice(
  method: HandoverMethod,
  fees: DeliveryFees | null | undefined,
) {
  if (method === "office") return "Free";
  const rate = deliveryRate(method, fees);
  return rate == null ? "Fee confirmed by staff" : rate === 0 ? "Free" : `${formatPhp(rate)} per way`;
}

/** One bill line for a leg: "Delivery · within Cebu City". Null when not recorded. */
export function handoverBillLine(
  leg: HandoverLeg,
  method: HandoverMethod | null,
  fee: number,
): { label: string; detail: string; fee: number } | null {
  if (!method) return null;
  if (method === "office") {
    return { label: copy[leg].bill.office, detail: "At our office", fee: 0 };
  }
  const zone = method === "within_city" ? "Within Cebu City" : "Outside Cebu City";
  return {
    label: copy[leg].bill.delivered,
    // No rate in Settings when booked: staff add the fee as a charge.
    detail: fee > 0 ? zone : `${zone} · fee confirmed by staff`,
    fee,
  };
}
