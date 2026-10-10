// Sends one queued customer booking email (see the booking_emails and
// release_return_emails migrations).
//
// Called by pg_net with { notification_id } and the x-booking-email-secret
// header. Claims the outbox row, renders the email from live booking data,
// sends it through Resend, and records the result. The release and return
// email carries a PDF of the signed agreement; the return email is a thank-you
// with the final bill.
//
// Secrets: RESEND_API_KEY, BOOKING_EMAIL_SECRET; optional EMAIL_FROM, SITE_URL.

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  type EmailDocuments,
  buildAgreementPdf,
  documentFilename,
  signaturePaths,
} from "./documents.ts";
import {
  type BookingEmailBooking,
  type BookingEmailCompany,
  type BookingEmailKind,
  type EmailBill,
  renderBookingEmail,
} from "./templates.ts";

/** Must be an address on a domain verified in Resend. */
const DEFAULT_FROM = "Zeke Car Rental & Services <no-reply@zekecebucarrental.com>";
const DEFAULT_SITE_URL = "https://www.zekecebucarrental.com";
const SIGNATURE_BUCKET = "rental-inspection-photos";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

type Claim =
  | { claimed: false; reason: string }
  | {
      claimed: true;
      id: string;
      kind: BookingEmailKind;
      attempt: number;
      recipient: string;
      booking: BookingEmailBooking;
      company: BookingEmailCompany;
      /** Release email only: the signed agreement for the PDF. */
      documents?: EmailDocuments | null;
      /** Return email only: the final bill. */
      bill?: EmailBill | null;
      plateNumber?: string | null;
    };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Constant-time comparison so the secret can't be guessed byte by byte. */
function sameSecret(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("BOOKING_EMAIL_SECRET");
  const provided = req.headers.get("x-booking-email-secret") ?? "";
  if (!expected || !sameSecret(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await req.json().catch(() => null)) as
    | { notification_id?: unknown }
    | null;
  const notificationId =
    typeof body?.notification_id === "string" ? body.notification_id : null;
  if (!notificationId) return json({ error: "notification_id is required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error: claimError } = await supabase.rpc(
    "claim_rental_notification",
    { p_id: notificationId },
  );
  if (claimError) {
    console.error("[send-booking-email] claim failed", claimError.message);
    return json({ error: "Claim failed" }, 500);
  }
  const claim = data as Claim;
  if (!claim.claimed) return json({ sent: false, reason: claim.reason });

  const finish = (args: {
    sent: boolean;
    messageId?: string | null;
    error?: string | null;
    retry?: boolean;
  }) =>
    supabase.rpc("finish_rental_notification", {
      p_id: claim.id,
      p_sent: args.sent,
      p_provider_message_id: args.messageId ?? null,
      p_error: args.error ?? null,
      p_retry: args.retry ?? true,
    });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    await finish({ sent: false, error: "RESEND_API_KEY is not set on the function." });
    return json({ error: "Email sending is not configured" }, 503);
  }

  const siteUrl = (Deno.env.get("SITE_URL")?.trim() || DEFAULT_SITE_URL).replace(/\/$/, "");
  const attachments: Array<{ filename: string; content: string }> = [];
  // Release: the signed agreement as a PDF. Without one there is nothing to attach.
  const agreement = claim.kind === "rental_released" ? claim.documents?.agreement : null;
  if (agreement) {
    const signatures = new Map<string, Uint8Array>();
    for (const path of signaturePaths(agreement)) {
      const { data: file, error } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .download(path);
      if (error || !file) {
        await finish({
          sent: false,
          error: `Signature download failed: ${error?.message ?? path}`,
        });
        return json({ error: "Signature download failed" }, 502);
      }
      signatures.set(path, new Uint8Array(await file.arrayBuffer()));
    }
    try {
      const pdf = await buildAgreementPdf({
        agreement,
        referenceNumber: claim.booking.referenceNumber,
        vehicleName: claim.booking.vehicleName,
        plateNumber: claim.plateNumber ?? null,
        company: {
          name: claim.company.name ?? null,
          phone: claim.company.phone,
          email: claim.company.email,
          address: claim.company.address,
          timezone: claim.company.timezone,
        },
        signatures,
      });
      attachments.push({
        filename: documentFilename(claim.booking.referenceNumber),
        content: toBase64(pdf),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finish({ sent: false, error: `PDF failed: ${message}`, retry: false });
      return json({ error: "PDF failed" }, 500);
    }
  }

  let email;
  try {
    email = renderBookingEmail({
      kind: claim.kind,
      booking: claim.booking,
      company: claim.company,
      siteUrl,
      bill: claim.bill ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ sent: false, error: `Render failed: ${message}`, retry: false });
    return json({ error: "Render failed" }, 500);
  }

  const replyTo = claim.company.email?.trim();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Duplicate pings for one outbox row send a single email.
        "Idempotency-Key": `rental-notification/${claim.id}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM")?.trim() || DEFAULT_FROM,
        to: [claim.recipient],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments.length ? { attachments } : {}),
        tags: [{ name: "kind", value: claim.kind }],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ sent: false, error: `Network error: ${message}` });
    return json({ error: "Resend unreachable" }, 502);
  }

  const result = (await response.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;

  if (response.ok && result?.id) {
    await finish({ sent: true, messageId: result.id });
    return json({ sent: true, id: result.id });
  }

  // 429 and 5xx are worth retrying; other 4xx (bad address, unverified
  // sender) will fail the same way every time.
  const retry = response.status === 429 || response.status >= 500;
  const message = `Resend ${response.status}: ${result?.message ?? response.statusText}`;
  console.error("[send-booking-email]", message);
  await finish({ sent: false, error: message, retry });
  return json({ sent: false, error: message }, 502);
});
