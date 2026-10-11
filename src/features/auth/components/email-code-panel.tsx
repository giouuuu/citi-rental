"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { checkEmailAction } from "@/features/auth/actions/email-code-actions";
import {
  CAPTCHA_LOAD_ERROR,
  useAuthCaptcha,
} from "@/features/auth/components/use-auth-captcha";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;
/** Supabase allows one code per email every 60 seconds. */
const RESEND_AFTER_MS = 60_000;

type SendState = "sending" | "sent" | "failed";

function sendErrorMessage(error: { code?: string; status?: number }) {
  if (error.code === "captcha_failed") {
    return "The security check expired. Send a new code.";
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "We just sent you a code. Wait a minute, then send a new one.";
  }
  if (error.code === "otp_disabled" || error.code === "signup_disabled") {
    return "Email codes are turned off right now. Message us to book.";
  }
  if (error.code === "email_address_invalid") {
    return "That email can't receive our code. Check it for typos.";
  }
  return "We could not send the code. Check your connection and try again.";
}

function verifyErrorMessage(error: { code?: string; status?: number }) {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Too many tries. Wait a few minutes, then send a new code.";
  }
  return "That code is wrong or has expired. Check the newest email from us, or send a new code.";
}

function formatCountdown(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Emails a 6-digit code to `email` as soon as it mounts, then signs the
 * browser in when the right code is typed. No password and no redirect: the
 * Supabase session lands in cookies and the server sees it on the next call.
 * `onVerified` runs while the panel still shows its busy state.
 */
export function EmailCodePanel({
  email,
  verifyLabel,
  onVerified,
  onChangeEmail,
  emailRedirectTo,
}: {
  email: string;
  /** Main button, e.g. "Verify and send booking". */
  verifyLabel: string;
  /** Returns an error message to show, or nothing when it went through. */
  onVerified: () => Promise<string | void>;
  onChangeEmail?: () => void;
  /** Where the link variant of the email lands, before the template shows codes. */
  emailRedirectTo?: string;
}) {
  const captcha = useAuthCaptcha();
  const [sendState, setSendState] = useState<SendState>("sending");
  /** A send is due as soon as the browser check hands us a token. */
  const wantSend = useRef(true);
  /** "Send a new code" was pressed and is waiting on that check. */
  const [awaitingCheck, setAwaitingCheck] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const send = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAwaitingCheck(false);
    setSendState("sending");
    setError(undefined);
    try {
      const check = await checkEmailAction(email);
      if (!check.success) {
        setError(check.message);
        setSendState("failed");
        return;
      }
      const { error: sendError } = await createClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          captchaToken: captcha.token ?? undefined,
          emailRedirectTo,
        },
      });
      captcha.reset();
      if (sendError) {
        setError(sendErrorMessage(sendError));
        setSendState("failed");
        if (sendError.status === 429) setResendAt(Date.now() + RESEND_AFTER_MS);
        return;
      }
      setCode("");
      setSendState("sent");
      setResendAt(Date.now() + RESEND_AFTER_MS);
    } catch {
      setError("We could not send the code. Check your connection and try again.");
      setSendState("failed");
    } finally {
      inFlight.current = false;
    }
  }, [captcha, email, emailRedirectTo]);

  // Send once the browser check passes; a resend waits for a fresh token.
  useEffect(() => {
    if (!wantSend.current || !captcha.ready) return;
    wantSend.current = false;
    void send();
  }, [captcha.ready, send]);

  function requestNewCode() {
    if (captcha.ready) {
      void send();
      return;
    }
    wantSend.current = true;
    setAwaitingCheck(true);
  }

  const waiting = resendAt > now;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(undefined);
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({
        email,
        token: value,
        type: "email",
      });
      if (verifyError) {
        setError(verifyErrorMessage(verifyError));
        return;
      }
      const message = await onVerified();
      if (message) setError(message);
    } catch {
      setError("We could not check the code. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  }

  const sending = sendState === "sending";
  const busy = sending || verifying;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 text-sm leading-6 text-muted-foreground">
        <p>
          {sending ? "Sending a 6-digit code to " : "We sent a 6-digit code to "}
          <span className="font-medium break-all text-brand-950">{email}</span>.
          {sending ? null : " Enter it below."}
        </p>
        {onChangeEmail ? (
          <button
            className="font-medium text-teal-700 underline-offset-4 hover:underline disabled:opacity-50"
            disabled={verifying}
            onClick={onChangeEmail}
            type="button"
          >
            Wrong email? Change it
          </button>
        ) : null}
      </div>

      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="email-code">6-digit code</FieldLabel>
          <InputOTP
            aria-invalid={Boolean(error) || undefined}
            autoComplete="one-time-code"
            autoFocus
            disabled={verifying || sendState === "failed"}
            id="email-code"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            onChange={(value) => {
              setCode(value);
              if (error && sendState === "sent") setError(undefined);
            }}
            onComplete={(value: string) => void verify(value)}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
          >
            <InputOTPGroup className="w-full">
              {Array.from({ length: CODE_LENGTH }, (_, index) => (
                <InputOTPSlot
                  aria-invalid={Boolean(error) || undefined}
                  className="h-12 flex-1 font-mono text-lg"
                  index={index}
                  key={index}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>
              The code works for 10 minutes. Check Spam or Promotions if it
              is not in your inbox.
            </FieldDescription>
          )}
        </Field>

        {captcha.widget}
        {captcha.failed ? (
          <p className="text-sm text-warning" role="alert">
            {CAPTCHA_LOAD_ERROR}
          </p>
        ) : null}

        <Button
          className="h-12 w-full text-base"
          disabled={busy || code.length !== CODE_LENGTH}
          type="submit"
        >
          {busy ? <Spinner /> : null}
          {verifying ? "Checking..." : sending ? "Sending code..." : verifyLabel}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        {waiting ? (
          <>
            No email yet? You can send a new code in{" "}
            <span className="font-medium text-brand-950 tabular-nums">
              {formatCountdown(resendAt - now)}
            </span>
          </>
        ) : (
          <Button
            className="h-11"
            disabled={busy || awaitingCheck}
            onClick={requestNewCode}
            type="button"
            variant="outline"
          >
            {awaitingCheck ? <Spinner /> : null}
            {awaitingCheck ? captcha.pendingLabel : "Send a new code"}
          </Button>
        )}
      </div>
    </div>
  );
}
