"use server";

import type { ActionResult } from "@/features/shared/types/resource";
import { registerSchema } from "@/features/auth/schemas/register-schema";
import {
  registerWithEmail,
  RegistrationError,
  type RegistrationStatus,
} from "@/features/auth/services/register-service";

type RegistrationData = {
  status: RegistrationStatus;
  message: string;
  redirectTo?: string;
};

export type RegisterActionResult = ActionResult<RegistrationData>;

const errorMessages: Record<RegistrationError["code"], string> = {
  already_authenticated: "You are already signed in. Open your dashboard to continue.",
  already_registered:
    "This email already has an account. Sign in instead, or use Forgot password if you don't remember it.",
  captcha: "The security check expired or failed. Please try again.",
  invalid_email: "That email address can't receive mail. Check it for typos.",
  configuration: "Registration is not available until Supabase is configured.",
  network:
    "Could not reach the authentication service. Check your internet connection and try again.",
  provisioning: "Your account was created, but setup could not finish. Try signing in or contact support.",
  rate_limit: "Too many registration attempts. Wait a few minutes and try again.",
  signup: "We could not create the account. Check your details or try signing in.",
  weak_password:
    "That password is too easy to guess or has appeared in a data leak. Choose a different one.",
};

export async function registerAction(
  formData: FormData,
): Promise<RegisterActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const captchaToken = String(formData.get("captchaToken") ?? "").trim();
    const result = await registerWithEmail(
      {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
      },
      captchaToken || undefined,
      String(formData.get("next") ?? "") || undefined,
    );
    if (result.status === "verification_required") {
      return {
        success: true,
        data: {
          status: result.status,
          message:
            "Check your inbox and confirm your email to finish creating your account.",
        },
      };
    }
    return {
      success: true,
      data: {
        status: result.status,
        redirectTo: result.redirectTo,
        message:
          result.redirectTo === "/dashboard"
            ? "Your workspace is ready. Opening the dashboard now."
            : "Your account is ready.",
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof RegistrationError
          ? errorMessages[error.code]
          : "Registration is temporarily unavailable. Please try again.",
    };
  }
}
