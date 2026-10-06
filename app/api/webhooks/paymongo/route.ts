import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyOwnerTelegram,
  siteUrl,
} from "@/features/booking/lib/notify-owner-telegram";
import { paymongoWebhookSecret } from "@/features/booking/lib/paymongo";
import {
  parsePaidCheckout,
  peekPaymongoEvent,
  verifyPaymongoSignature,
} from "@/features/booking/lib/paymongo-webhook";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";

/**
 * PayMongo webhook. Register it for `checkout_session.payment.paid` at
 * `<site>/api/webhooks/paymongo`. PayMongo retries anything but a 2xx, so:
 * bad signatures get 401, our own failures 500 (retry), and events we have
 * nothing to do with 200 (stop retrying).
 */
export async function POST(request: Request) {
  const secret = paymongoWebhookSecret();
  const supabase = createAdminClient();
  if (!secret || !supabase) {
    console.error("[paymongo] webhook received but PAYMONGO_WEBHOOK_SECRET or SUPABASE_SECRET_KEY is missing");
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  // The signature covers the exact bytes PayMongo sent: read before parsing.
  const rawBody = await request.text();
  const { type, livemode } = peekPaymongoEvent(rawBody);
  const check = verifyPaymongoSignature({
    rawBody,
    header: request.headers.get("paymongo-signature"),
    secret,
    livemode,
  });
  if (!check.ok) {
    console.warn("[paymongo] rejected webhook:", check.reason);
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  if (type !== "checkout_session.payment.paid") {
    return Response.json({ received: true, ignored: type });
  }

  const paid = parsePaidCheckout(rawBody);
  if (!paid) {
    return Response.json({ received: true, ignored: "no paid payment" });
  }

  const { data, error } = await supabase.rpc("apply_paymongo_checkout_paid", {
    p_event_id: paid.eventId,
    p_checkout_session_id: paid.checkoutSessionId,
    p_paymongo_payment_id: paid.paymentId,
    p_amount_centavos: paid.amountCentavos,
    p_livemode: paid.livemode,
  });
  if (error) {
    console.error("[paymongo] apply_paymongo_checkout_paid failed", error.message);
    return Response.json({ error: "could not record payment" }, { status: 500 });
  }

  const result = data as Record<string, unknown>;
  if (result.result === "recorded" || result.result === "recorded_closed") {
    void notifyOwnerTelegram({
      text: [
        result.result === "recorded"
          ? "PayMongo payment received — confirm the deposit"
          : "PayMongo payment for a closed booking — review for refund",
        `Ref: ${result.reference_number}`,
        `Car: ${result.vehicle_name ?? "—"}`,
        `Amount: ${formatPhp(Number(result.amount ?? 0))}`,
        `PayMongo: ${paid.paymentId}`,
        `Customer: ${result.customer_name ?? "—"} · ${result.customer_phone ?? "—"}`,
        `Ops: ${siteUrl()}/rentals/${result.rental_id}`,
      ].join("\n"),
    });
  } else if (result.result !== "duplicate") {
    console.warn("[paymongo] paid webhook not applied:", result.result, {
      checkoutSessionId: paid.checkoutSessionId,
      eventId: paid.eventId,
    });
  }

  return Response.json({ received: true, result: result.result });
}
