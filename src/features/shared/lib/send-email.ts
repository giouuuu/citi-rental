import "server-only";

/** Must be an address on a domain verified in Resend. */
const DEFAULT_FROM = "Zeke Car Rental & Services <no-reply@zekecebucarrental.com>";

export type OutgoingEmail = {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative; keeps spam scores down and helps screen readers. */
  text: string;
  replyTo?: string;
  /** Same key within 24h is sent once — pass one when a caller may retry. */
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; status: number; message: string };

/**
 * Sends a transactional email (booking follow-ups, reminders) through
 * Resend's REST API. Auth emails (confirm, reset) stay with Supabase.
 * Needs RESEND_API_KEY; EMAIL_FROM overrides the sender.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-email] RESEND_API_KEY is missing");
    return { ok: false, status: 503, message: "Email sending is not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;
  if (response.ok && body?.id) return { ok: true, id: body.id };

  console.error("[send-email] Resend rejected", response.status, body?.message);
  return {
    ok: false,
    status: response.status,
    message: body?.message ?? response.statusText,
  };
}

/** For interpolating customer-supplied values into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
