"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { settingsSchema } from "@/features/settings/schemas/settings-schema";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import {
  CONTACT_CHANNEL_KEYS,
  contactChannelField,
} from "@/features/settings/lib/contact-channels";

export async function saveSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to save organization settings.",
    };
  }

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted settings.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active || !isAdminRole(profile.role)) {
      throw new Error("Only owners or admins can update company settings.");
    }

    const { error } = await supabase.rpc("update_company_settings", {
      p_name: parsed.data.name,
      p_timezone: parsed.data.timezone,
      p_online_threshold: parsed.data.tracker_online_threshold_minutes,
      p_delayed_threshold: parsed.data.tracker_delayed_threshold_minutes,
      p_retention_days: parsed.data.location_retention_days,
      p_gps_provider: parsed.data.gps_provider,
    });
    if (error) throw error;

    const { data: company } = await supabase
      .from("company_profile")
      .select("id")
      .single();
    if (!company) throw new Error("Company profile is missing.");

    const { error: paymentError } = await supabase
      .from("company_profile")
      .update({
        reservation_fee: parsed.data.reservation_fee,
        driver_daily_rate: parsed.data.driver_daily_rate,
        driver_hours_per_day: parsed.data.driver_hours_per_day,
        driver_overtime_hourly_rate: parsed.data.driver_overtime_hourly_rate,
        delivery_fee_within_city: parsed.data.delivery_fee_within_city,
        delivery_fee_outside_city: parsed.data.delivery_fee_outside_city,
        free_cancellation_hours: parsed.data.free_cancellation_hours,
        turnaround_minutes: parsed.data.turnaround_minutes,
        payment_instructions: parsed.data.payment_instructions?.trim() || null,
        operating_address: parsed.data.operating_address?.trim() || null,
        review_google_url: parsed.data.review_google_url?.trim() || null,
        review_facebook_url: parsed.data.review_facebook_url?.trim() || null,
        review_thank_you_message:
          parsed.data.review_thank_you_message?.trim() || null,
        ...Object.fromEntries(
          CONTACT_CHANNEL_KEYS.map(contactChannelField).map((column) => [
            column,
            parsed.data[column]?.trim() || null,
          ]),
        ),
      })
      .eq("id", company.id);
    if (paymentError) throw paymentError;

    revalidateResource("/settings");
    // The landing page's contact button reads these channels. Page scope:
    // layout scope on "/" would drop every cached route.
    revalidatePath("/");
    // Booking pages price delivery from these fees.
    revalidatePath("/book/[vehicleId]", "page");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Settings could not be saved.",
    };
  }
}
