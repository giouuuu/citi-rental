"use server";

import { z } from "zod";

import {
  DISPOSABLE_EMAIL_MESSAGE,
  emailDomain,
  isDisposableEmailDomain,
} from "@/features/auth/lib/email-checks";
import { resolvePostAuthPath } from "@/features/auth/lib/post-auth-redirect";
import { canDomainReceiveEmail } from "@/features/auth/services/check-email-domain";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

/**
 * Run before we email a code: rejects throwaway inboxes and domains that
 * cannot receive mail. Ownership is proven by the code, not here.
 */
export async function checkEmailAction(rawEmail: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { success: false, message: "Enter a valid email address." };
  }

  const domain = emailDomain(parsed.data);
  if (isDisposableEmailDomain(domain)) {
    return { success: false, message: DISPOSABLE_EMAIL_MESSAGE };
  }
  if (!(await canDomainReceiveEmail(domain))) {
    return {
      success: false,
      message: `${domain} can't receive email. Check it for typos.`,
    };
  }
  return { success: true };
}

/**
 * After the code is verified in the browser: give a brand-new account its
 * customer profile (never an ops role) and say where to go next.
 */
export async function finishEmailCodeSignInAction(input: {
  fullName?: string;
  next?: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Sign-in is not configured yet." };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") {
    return {
      success: false,
      message: "The code was accepted but the sign-in did not stick. Try again.",
    };
  }

  const { error } = await supabase.rpc("ensure_customer_profile", {
    p_full_name: input.fullName?.trim() || null,
  });
  if (error) {
    return {
      success: false,
      message: "You are signed in, but your account could not be set up. Contact us to finish your booking.",
    };
  }

  return {
    success: true,
    data: { redirectTo: await resolvePostAuthPath(supabase, input.next) },
  };
}
