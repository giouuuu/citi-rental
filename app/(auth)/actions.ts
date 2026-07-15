"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email("Enter a valid email address.").trim();
const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.");

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type AuthActionState = {
  message?: string;
  success?: boolean;
  errors?: {
    email?: string[];
    password?: string[];
  };
};

export async function loginAction(
  _previousState: AuthActionState,
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

  redirect("/dashboard");
}

export async function forgotPasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validated = emailSchema.safeParse(formData.get("email"));

  if (!validated.success) {
    return { errors: { email: validated.error.flatten().formErrors } };
  }

  if (!isSupabaseConfigured()) {
    return {
      message: "Supabase is not configured. Add project credentials to send reset emails.",
    };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(validated.data, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { message: "The reset email could not be sent. Please try again." };
  }

  return {
    success: true,
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validated = passwordSchema.safeParse(formData.get("password"));

  if (!validated.success) {
    return { errors: { password: validated.error.flatten().formErrors } };
  }

  if (!isSupabaseConfigured()) {
    return { message: "Supabase is not configured." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: validated.data });

  if (error) {
    return { message: "This reset link is invalid or expired. Request a new one." };
  }

  redirect("/login?reset=success");
}

export async function logoutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
