"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  isBookingNextPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  nextPath,
  label = "Continue with Google",
}: {
  /** Safe in-app path to return to after OAuth (e.g. /book/[id]?...). */
  nextPath?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const safeNext = sanitizeNextPath(nextPath);
  // Default to home after Google OAuth; only booking returns keep their next path.
  const postAuthNext = isBookingNextPath(safeNext) ? safeNext! : "/";

  async function continueWithGoogle() {
    setMessage(undefined);

    if (!isSupabaseConfigured()) {
      setMessage("Google sign-in is unavailable until Supabase is configured.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const redirectUrl = new URL(`${window.location.origin}/auth/callback`);
      redirectUrl.searchParams.set("next", postAuthNext);
      // Never set provision=organization — Google users become customers
      // via the auth trigger, not owner self-service registration.

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (error) {
        setMessage(error.message || "Google sign-in could not start. Try again.");
        setPending(false);
      }
      // On success the browser navigates away to Google.
    } catch {
      setMessage("Google sign-in could not start. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        disabled={pending}
        onClick={continueWithGoogle}
        size="lg"
        type="button"
        variant="outline"
      >
        {pending ? <Spinner /> : <GoogleGlyph />}
        {pending ? "Redirecting..." : label}
      </Button>
      {message ? (
        <p className="text-center text-xs text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
