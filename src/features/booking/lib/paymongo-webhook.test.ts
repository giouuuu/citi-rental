import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  parsePaidCheckout,
  peekPaymongoEvent,
  verifyPaymongoSignature,
} from "./paymongo-webhook";

const secret = "whsk_test_secret";
const now = 1_790_000_000;

function sign(body: string, t = now) {
  return createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}

const paidEvent = JSON.stringify({
  data: {
    id: "evt_123",
    type: "event",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: false,
      data: {
        id: "cs_abc",
        type: "checkout_session",
        attributes: {
          payments: [
            { id: "pay_1", attributes: { amount: 50000, status: "paid" } },
            { id: "pay_2", attributes: { amount: 99999, status: "failed" } },
          ],
        },
      },
    },
  },
});

describe("verifyPaymongoSignature", () => {
  it("accepts the test-mode signature in test mode", () => {
    const header = `t=${now},te=${sign(paidEvent)},li=`;
    expect(
      verifyPaymongoSignature({ rawBody: paidEvent, header, secret, livemode: false, nowSeconds: now }),
    ).toEqual({ ok: true, livemode: false });
  });

  it("checks the live signature, not the test one, in live mode", () => {
    const header = `t=${now},te=${sign(paidEvent)},li=deadbeef`;
    expect(
      verifyPaymongoSignature({ rawBody: paidEvent, header, secret, livemode: true, nowSeconds: now }).ok,
    ).toBe(false);
  });

  it("rejects a body changed after signing", () => {
    const header = `t=${now},te=${sign(paidEvent)},li=`;
    const result = verifyPaymongoSignature({
      rawBody: paidEvent.replace("50000", "5000000"),
      header,
      secret,
      livemode: false,
      nowSeconds: now,
    });
    expect(result).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects an old timestamp and a missing header", () => {
    const old = now - 3600;
    const header = `t=${old},te=${sign(paidEvent, old)},li=`;
    expect(
      verifyPaymongoSignature({ rawBody: paidEvent, header, secret, livemode: false, nowSeconds: now }).ok,
    ).toBe(false);
    expect(
      verifyPaymongoSignature({ rawBody: paidEvent, header: null, secret, livemode: false }).ok,
    ).toBe(false);
  });
});

describe("parsePaidCheckout", () => {
  it("reads the session, event, and only the paid payments", () => {
    expect(parsePaidCheckout(paidEvent)).toEqual({
      eventId: "evt_123",
      livemode: false,
      checkoutSessionId: "cs_abc",
      paymentId: "pay_1",
      amountCentavos: 50000,
    });
  });

  it("ignores other event types and junk", () => {
    expect(parsePaidCheckout(paidEvent.replace("checkout_session.payment.paid", "payment.failed"))).toBeNull();
    expect(parsePaidCheckout("not json")).toBeNull();
  });

  it("peeks the type and mode before verification", () => {
    expect(peekPaymongoEvent(paidEvent)).toEqual({
      type: "checkout_session.payment.paid",
      livemode: false,
    });
  });
});
