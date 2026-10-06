import "server-only";

import { TURNSTILE_LOOKUP_ACTION } from "@/features/booking/lib/booking-contact";

// Cloudflare's documented always-pass test keys, used only outside production
// so local dev works without a Turnstile account.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const isProduction = process.env.NODE_ENV === "production";

/** Public site key for the widget, or null when production is unconfigured. */
export function turnstileSiteKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
    (isProduction ? null : TEST_SITE_KEY)
  );
}

function turnstileSecretKey(): string | null {
  return (
    process.env.TURNSTILE_SECRET_KEY ?? (isProduction ? null : TEST_SECRET_KEY)
  );
}

type SiteverifyResponse = {
  success: boolean;
  action?: string;
  "error-codes"?: string[];
};

/**
 * Server-side Turnstile check. Tokens are single-use and expire after 300s,
 * so the client must reset its widget after every lookup.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = turnstileSecretKey();
  if (!secret) return { ok: false, reason: "not-configured" };
  if (!token) return { ok: false, reason: "missing-token" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, cache: "no-store" },
    );
    const result = (await response.json()) as SiteverifyResponse;
    if (!result.success) {
      return {
        ok: false,
        reason: result["error-codes"]?.join(",") || "rejected",
      };
    }
    // Test keys report a dummy action; real keys must match the widget's.
    if (
      secret !== TEST_SECRET_KEY &&
      result.action !== TURNSTILE_LOOKUP_ACTION
    ) {
      return { ok: false, reason: "action-mismatch" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
