#!/usr/bin/env node
// Registers this site's PayMongo webhook and prints its signing secret.
//
//   PAYMONGO_SECRET_KEY=sk_test_... node scripts/paymongo-register-webhook.mjs https://your-site.com
//
// Put the printed secret in PAYMONGO_WEBHOOK_SECRET. Run once per mode: a
// sk_test_ key registers a test webhook, a sk_live_ key a live one.

const key = process.env.PAYMONGO_SECRET_KEY?.trim();
const site = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

if (!key || !/^https:\/\//.test(site)) {
  console.error(
    "Usage: PAYMONGO_SECRET_KEY=sk_... node scripts/paymongo-register-webhook.mjs https://your-site.com",
  );
  process.exit(1);
}

const response = await fetch("https://api.paymongo.com/v1/webhooks", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    data: {
      attributes: {
        url: `${site}/api/webhooks/paymongo`,
        events: ["checkout_session.payment.paid"],
      },
    },
  }),
});

const payload = await response.json().catch(() => null);
if (!response.ok) {
  console.error("PayMongo refused the webhook:", JSON.stringify(payload?.errors ?? payload, null, 2));
  process.exit(1);
}

const attributes = payload.data.attributes;
console.log(`Webhook ${payload.data.id} → ${attributes.url} (livemode: ${attributes.livemode})`);
console.log(`PAYMONGO_WEBHOOK_SECRET=${attributes.secret_key}`);
