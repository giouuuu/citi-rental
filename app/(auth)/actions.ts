"use server";

import { redirect } from "next/navigation";

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas/login-schema";
import { resolvePostAuthPath } from "@/features/auth/lib/post-auth-redirect";
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
  const { error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(
    validated.data.email,
    {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    },
  );

  if (error) {
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
