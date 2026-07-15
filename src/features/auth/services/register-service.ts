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
      | "provisioning"
      | "rate_limit"
      | "signup",
  ) {
    super(code);
  }
}

export async function registerWithEmail(
  input: RegisterInput,
): Promise<RegistrationStatus> {
  if (!isSupabaseConfigured()) {
    throw new RegistrationError("configuration");
  }

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
}
