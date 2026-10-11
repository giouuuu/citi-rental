"use server";

import { setPasswordSchema } from "@/features/auth/schemas/set-password-schema";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Adds (or changes) the signed-in account's password, e.g. for a customer
 * who booked with an email code and would rather type a password next time.
 * The email code keeps working either way.
 */
export async function setPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, message: "Accounts are not configured yet." };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") {
    return {
      success: false,
      message: "Your session expired. Sign in again, then set your password.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "weak_password") {
      return {
        success: false,
        message: "Choose a different password.",
        fieldErrors: {
          password: [
            "That password is too easy to guess or has appeared in a data leak. Choose a different one.",
          ],
        },
      };
    }
    if (error.code === "same_password") {
      return {
        success: false,
        message: "Choose a different password.",
        fieldErrors: {
          password: ["That is already your password. Choose a different one."],
        },
      };
    }
    if (error.code === "reauthentication_needed") {
      return {
        success: false,
        message:
          "For your safety, sign out and back in with an email code, then set your password.",
      };
    }
    return {
      success: false,
      message: "Your password could not be saved. Please try again.",
    };
  }

  return { success: true };
}
