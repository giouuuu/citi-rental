import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { RegisterInput } from "@/features/auth/schemas/register-schema";

export type RegistrationStatus = "signed_in" | "verification_required";

export class RegistrationError extends Error {
  constructor(
    readonly code:
      | "already_authenticated"
      | "configuration"
      | "network"
      | "provisioning"
      | "rate_limit"
      | "signup",
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
): Promise<RegistrationStatus> {
  if (!isSupabaseConfigured()) {
    throw new RegistrationError("configuration");
  }

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    if (claimsData?.claims?.sub) {
      throw new RegistrationError("already_authenticated");
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          organization_name: input.organizationName,
        },
        emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard&provision=organization`,
      },
    });

    if (error) {
      throw new RegistrationError(error.status === 429 ? "rate_limit" : "signup");
    }

    if (!data.session) return "verification_required";

    const { error: provisioningError } = await supabase.rpc(
      "complete_self_service_registration",
      {
        p_full_name: input.fullName,
        p_organization_name: input.organizationName,
      },
    );
    if (provisioningError) {
      throw new RegistrationError("provisioning");
    }

    return "signed_in";
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    if (isNetworkFailure(error)) throw new RegistrationError("network");
    throw error;
  }
}
