import "server-only";

import {
  isBookingNextPath,
  resolvePostAuthPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
import { siteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { RegisterInput } from "@/features/auth/schemas/register-schema";

export type RegistrationStatus = "signed_in" | "verification_required";

/**
 * `redirectTo` follows the role the RPC granted: the first registrant becomes
 * admin (`/dashboard`); later ones become customers (`/`).
 */
export type RegistrationResult =
  | { status: "signed_in"; redirectTo: string }
  | { status: "verification_required" };

export class RegistrationError extends Error {
  constructor(
    readonly code:
      | "already_authenticated"
      | "already_registered"
      | "captcha"
      | "invalid_email"
      | "configuration"
      | "network"
      | "provisioning"
      | "rate_limit"
      | "signup"
      | "weak_password",
  ) {
    super(code);
  }
}

function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false;

  const candidates = [error, error.cause].filter(
    (value): value is Error => value instanceof Error,
  );

  return candidates.some((candidate) => {
    const code =
      "code" in candidate && typeof candidate.code === "string"
        ? candidate.code
        : undefined;

    return (
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      candidate.message.toLowerCase().includes("fetch failed") ||
      candidate.message.toLowerCase().includes("connect timeout")
    );
  });
}

export async function registerWithEmail(
  input: RegisterInput,
  captchaToken?: string,
  /** A booking to return to, e.g. a guest who signed up from the booking form. */
  rawNext?: string,
): Promise<RegistrationResult> {
  if (!isSupabaseConfigured()) {
    throw new RegistrationError("configuration");
  }

  const safeNext = sanitizeNextPath(rawNext);
  const bookingNext = isBookingNextPath(safeNext) ? safeNext : undefined;
  // The confirm link provisions the profile, then lands on the booking (or
  // the role's home: admins on the dashboard, customers on the landing).
  const confirmUrl = new URL("/auth/callback", siteUrl());
  confirmUrl.searchParams.set("next", bookingNext ?? "/dashboard");
  confirmUrl.searchParams.set("provision", "owner");

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    if (claimsData?.claims?.sub) {
      throw new RegistrationError("already_authenticated");
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          ops_registration: "true",
        },
        emailRedirectTo: confirmUrl.toString(),
        captchaToken,
      },
    });

    if (error) {
      if (error.code === "captcha_failed") {
        throw new RegistrationError("captcha");
      }
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        throw new RegistrationError("already_registered");
      }
      if (error.code === "weak_password") {
        throw new RegistrationError("weak_password");
      }
      if (error.code === "email_address_invalid") {
        throw new RegistrationError("invalid_email");
      }
      throw new RegistrationError(error.status === 429 ? "rate_limit" : "signup");
    }

    if (!data.session) return { status: "verification_required" };

    const { error: provisioningError } = await supabase.rpc(
      "complete_self_service_registration",
      {
        p_full_name: input.fullName,
      },
    );
    if (provisioningError) {
      throw new RegistrationError("provisioning");
    }

    return {
      status: "signed_in",
      redirectTo: await resolvePostAuthPath(supabase, bookingNext),
    };
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    if (isNetworkFailure(error)) throw new RegistrationError("network");
    throw error;
  }
}
