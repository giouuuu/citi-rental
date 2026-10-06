import "server-only";

/**
 * PayMongo Checkout API client (https://docs.paymongo.com).
 *
 * Env:
 *   PAYMONGO_SECRET_KEY       sk_test_… / sk_live_… — creates Checkout Sessions
 *   PAYMONGO_WEBHOOK_SECRET   whsk_… — returned when the webhook is registered
 *   PAYMONGO_PAYMENT_METHODS  optional, comma-separated; defaults below
 *
 * Online payment is off until PAYMONGO_SECRET_KEY is set; the pay page then
 * keeps the manual QR + proof upload only.
 */

const API_BASE = "https://api.paymongo.com/v1";
const DEFAULT_METHODS = ["gcash", "paymaya", "card", "qrph"];

export function isPaymongoEnabled() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY?.trim());
}

export function paymongoWebhookSecret() {
  return process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || null;
}

function paymentMethods() {
  const configured = process.env.PAYMONGO_PAYMENT_METHODS?.split(",")
    .map((method) => method.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_METHODS;
}

function authHeader() {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key) throw new Error("Online payment is not set up yet.");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** PayMongo amounts are integer centavos. */
export function toCentavos(amount: number) {
  return Math.round(amount * 100);
}

export type CheckoutSession = {
  id: string;
  checkoutUrl: string;
  livemode: boolean;
};

export async function createCheckoutSession(input: {
  amount: number;
  referenceNumber: string;
  rentalId: string;
  itemName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  billing?: { name?: string; email?: string; phone?: string };
}): Promise<CheckoutSession> {
  const billing = Object.fromEntries(
    Object.entries(input.billing ?? {}).filter(([, value]) => value),
  );

  const response = await fetch(`${API_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              name: input.itemName,
              amount: toCentavos(input.amount),
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: paymentMethods(),
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          send_email_receipt: Boolean(billing.email),
          show_line_items: true,
          show_description: true,
          ...(Object.keys(billing).length ? { billing } : {}),
          metadata: {
            rental_id: input.rentalId,
            reference_number: input.referenceNumber,
          },
        },
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      id?: string;
      attributes?: { checkout_url?: string; livemode?: boolean };
    };
    errors?: { detail?: string }[];
  } | null;

  if (!response.ok || !payload?.data?.id || !payload.data.attributes?.checkout_url) {
    console.error("[paymongo] checkout session failed", response.status, payload?.errors);
    throw new Error("We could not start online payment. Please try again.");
  }

  return {
    id: payload.data.id,
    checkoutUrl: payload.data.attributes.checkout_url,
    livemode: Boolean(payload.data.attributes.livemode),
  };
}
