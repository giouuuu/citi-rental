"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";

// Supabase Auth verifies the token against the project's Turnstile secret,
// so the real site key is used everywhere — Cloudflare's test key would fail.
// The widget's hostname list must include every domain the forms run on.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export const CAPTCHA_LOAD_ERROR =
  "The security check could not load. Refresh the page and try again.";

/**
 * Turnstile token for Supabase email/password calls (sign in, sign up,
 * password reset email). Tokens are single-use: call `reset()` after every
 * request, whatever the outcome.
 */
export function useAuthCaptcha() {
  const ref = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const widget = SITE_KEY ? (
    <Turnstile
      className="min-h-0"
      onAfterInteractive={() => setInteractive(false)}
      onBeforeInteractive={() => setInteractive(true)}
      onError={() => {
        setToken(null);
        setFailed(true);
      }}
      onExpire={() => setToken(null)}
      onSuccess={(next) => {
        setToken(next);
        setFailed(false);
      }}
      options={{
        appearance: "interaction-only",
        size: "flexible",
        theme: "auto",
      }}
      ref={ref}
      siteKey={SITE_KEY}
      // "flexible" sets an inline 300px min-width; on a 320px phone that
      // widened the sign-in form past the screen. Let the box shrink and clip
      // the (rarely shown) checkbox frame instead.
      style={{ minWidth: 0, maxWidth: "100%", overflow: "hidden" }}
    />
  ) : null;

  return {
    widget,
    token,
    /** False while the check is still running (or failed). */
    ready: !SITE_KEY || token !== null,
    failed,
    /** Submit-button label while the check is pending. */
    pendingLabel: interactive
      ? "Tick the box above to continue"
      : "Checking your browser...",
    reset() {
      setToken(null);
      ref.current?.reset();
    },
  };
}
