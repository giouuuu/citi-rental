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
};

export type RegisterActionResult = ActionResult<RegistrationData>;

const errorMessages: Record<RegistrationError["code"], string> = {
  already_authenticated: "You are already signed in. Open your dashboard to continue.",
  configuration: "Registration is not available until Supabase is configured.",
  provisioning: "Your account was created, but workspace setup could not finish. Open the dashboard or contact support.",
  rate_limit: "Too many registration attempts. Wait a few minutes and try again.",
  signup: "We could not create the account. Check your details or try signing in.",
};

export async function registerAction(
  formData: FormData,
): Promise<RegisterActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    organizationName: formData.get("organizationName"),
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
    const status = await registerWithEmail({
      fullName: parsed.data.fullName,
      organizationName: parsed.data.organizationName,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    return {
      success: true,
      data: {
        status,
        message:
          status === "signed_in"
            ? "Your workspace is ready. Opening the dashboard now."
            : "Check your inbox and confirm your email to finish creating your workspace.",
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
