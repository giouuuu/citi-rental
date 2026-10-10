"use server";

import { redirect } from "next/navigation";

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas/login-schema";
import { resolvePostAuthPath } from "@/features/auth/lib/post-auth-redirect";
import { siteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  message?: string;
  success?: boolean;
  errors?: {
    email?: string[];
    password?: string[];
  };
};

const CAPTCHA_FAILED_MESSAGE =
  "The security check expired or failed. Please try again.";

/** Turnstile token from the form; Supabase Auth verifies it. */
function captchaTokenFrom(formData: FormData) {
  const token = String(formData.get("captchaToken") ?? "").trim();
  return token || undefined;
}

export async function loginAction(
  formData: FormData,
): Promise<AuthActionState> {
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return {
      message:
        "Supabase is not configured yet. Use the demo workspace link below to review Milestone 1.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    ...validated.data,
    options: { captchaToken: captchaTokenFrom(formData) },
  });

  if (error) {
    if (error.code === "captcha_failed") {
      return { message: CAPTCHA_FAILED_MESSAGE };
    }
    if (error.code === "email_not_confirmed") {
      return {
        message:
          "Confirm your email first — open the verification link we sent to your inbox (check spam too), then sign in.",
      };
    }
    return { message: "Email or password is incorrect. Please try again." };
  }

  const rawNext = String(formData.get("next") ?? "").trim();
  const nextPath = await resolvePostAuthPath(supabase, rawNext);

  redirect(nextPath);
}

export async function forgotPasswordAction(
  formData: FormData,
): Promise<AuthActionState> {
  const validated = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return {
      message: "Supabase is not configured. Add project credentials to send reset emails.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    validated.data.email,
    {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
      captchaToken: captchaTokenFrom(formData),
    },
  );

  if (error) {
    if (error.code === "captcha_failed") {
      return { message: CAPTCHA_FAILED_MESSAGE };
    }
    return { message: "The reset email could not be sent. Please try again." };
  }

  return {
    success: true,
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  formData: FormData,
): Promise<AuthActionState> {
  const validated = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { message: "Supabase is not configured." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });

  if (error) {
    return { message: "This reset link is invalid or expired. Request a new one." };
  }

  redirect("/login?reset=success");
}

export async function logoutAction(formData?: FormData) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const rawNext = String(formData?.get("next") ?? "").trim();
  const nextPath =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.includes("\\")
      ? rawNext
      : "/login";

  redirect(nextPath);
}
