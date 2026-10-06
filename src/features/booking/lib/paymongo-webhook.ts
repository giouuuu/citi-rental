import { createHmac, timingSafeEqual } from "node:crypto";

/** Reject signatures older than this to blunt replayed requests. */
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type PaymongoSignatureCheck =
  | { ok: true; livemode: boolean }
  | { ok: false; reason: string };

/**
 * Verifies a `Paymongo-Signature` header (`t=<unix>,te=<hex>,li=<hex>`).
 * PayMongo signs `<t>.<raw body>` with HMAC-SHA256 using the webhook's secret;
 * `te` carries the test-mode signature and `li` the live-mode one.
 * https://developers.paymongo.com/docs/securing-webhook
 */
export function verifyPaymongoSignature(options: {
  rawBody: string;
  header: string | null;
  secret: string;
  livemode: boolean;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): PaymongoSignatureCheck {
  const { rawBody, header, secret, livemode } = options;
  if (!header) return { ok: false, reason: "missing signature header" };

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const expected = livemode ? parts.li : parts.te;
  if (!Number.isFinite(timestamp) || !expected) {
    return { ok: false, reason: "malformed signature header" };
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: "signature timestamp outside tolerance" };
  }

  const computed = createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true, livemode };
}

export type PaymongoPaidCheckout = {
  eventId: string;
  livemode: boolean;
  checkoutSessionId: string;
  paymentId: string;
  amountCentavos: number;
};

type EventPayload = {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: {
        id?: string;
        attributes?: {
          payments?: {
            id?: string;
            attributes?: { amount?: number; status?: string };
          }[];
        };
      };
    };
  };
};

/** Reads the event type and livemode flag before the signature is checked. */
export function peekPaymongoEvent(rawBody: string): {
  type: string | null;
  livemode: boolean;
} {
  try {
    const event = JSON.parse(rawBody) as EventPayload;
    return {
      type: event.data?.attributes?.type ?? null,
      livemode: Boolean(event.data?.attributes?.livemode),
    };
  } catch {
    return { type: null, livemode: false };
  }
}

/**
 * Extracts a paid Checkout Session from a `checkout_session.payment.paid`
 * event. Only payments PayMongo marks `paid` count toward the amount.
 */
export function parsePaidCheckout(rawBody: string): PaymongoPaidCheckout | null {
  let event: EventPayload;
  try {
    event = JSON.parse(rawBody) as EventPayload;
  } catch {
    return null;
  }

  const attributes = event.data?.attributes;
  const session = attributes?.data;
  if (
    attributes?.type !== "checkout_session.payment.paid" ||
    !event.data?.id ||
    !session?.id
  ) {
    return null;
  }

  const paid = (session.attributes?.payments ?? []).filter(
    (payment) => payment.attributes?.status === "paid" && payment.id,
  );
  if (!paid.length) return null;

  return {
    eventId: event.data.id,
    livemode: Boolean(attributes.livemode),
    checkoutSessionId: session.id,
    paymentId: paid.map((payment) => payment.id).join(","),
    amountCentavos: paid.reduce(
      (sum, payment) => sum + Number(payment.attributes?.amount ?? 0),
      0,
    ),
  };
}
