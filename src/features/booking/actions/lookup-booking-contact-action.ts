"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseBookingContact,
  type ResolvedBookingContact,
} from "@/features/booking/lib/booking-contact";
import { verifyTurnstile } from "@/features/booking/lib/turnstile";
import type { ActionResult } from "@/features/shared/types/resource";

export type LookupBookingContactResult = ActionResult<ResolvedBookingContact>;

async function clientIp() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip")?.trim() || null;
}

export async function lookupBookingContactAction(
  formData: FormData,
): Promise<LookupBookingContactResult> {
  const contact = parseBookingContact(String(formData.get("contact") ?? ""));
  if (!contact) {
    return {
      success: false,
      message: "Enter your full email address or mobile number.",
      fieldErrors: {
        contact: ["Enter your full email address or mobile number."],
      },
    };
  }

  const ip = await clientIp();
  const check = await verifyTurnstile(
    String(formData.get("turnstileToken") ?? ""),
    ip,
  );
  if (!check.ok) {
    if (check.reason === "not-configured") {
      console.error("[booking] Turnstile secret key is not configured");
      return {
        success: false,
        message:
          "Guest booking is temporarily unavailable. Please sign in instead.",
      };
    }
    return {
      success: false,
      message: "We could not verify you are human. Please try again.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[booking] SUPABASE_SECRET_KEY is not configured");
    return {
      success: false,
      message:
        "Guest booking is temporarily unavailable. Please sign in instead.",
    };
  }

  const { data, error } = await supabase.rpc("lookup_booking_contact", {
    p_email: contact.kind === "email" ? contact.value : null,
    p_phone: contact.kind === "phone" ? contact.value : null,
    p_client_key: ip
      ? createHash("sha256").update(`booking-lookup:${ip}`).digest("hex")
      : null,
  });

  if (error) {
    if (error.code === "22023") {
      return {
        success: false,
        message: error.message,
        fieldErrors: { contact: [error.message] },
      };
    }
    if (error.code === "P0001") {
      return { success: false, message: error.message };
    }
    console.error("[booking] lookup_booking_contact failed", error.message);
    return {
      success: false,
      message: "We could not check that right now. Please try again.",
    };
  }

  const payload = (data ?? {}) as { returning?: boolean; initial?: string };
  return {
    success: true,
    data: {
      ...contact,
      returning: Boolean(payload.returning),
      initial:
        typeof payload.initial === "string" && payload.initial
          ? payload.initial
          : undefined,
    },
  };
}
