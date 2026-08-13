"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/types/resource";
import { rentalDefinition } from "@/features/rentals/schemas/rental-definition";
import {
  mapRentalDbError,
  parseAvailabilityResult,
} from "@/features/rentals/lib/booking-gates";
import { isPublicCustomerBooking } from "@/features/rentals/lib/is-public-customer-booking";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

function toTimestamptz(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Enter a valid start and return date/time.");
  }
  return date.toISOString();
}

export async function saveRentalAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: "Connect Supabase to create or update rentals.",
    };
  }

  const values = Object.fromEntries(
    rentalDefinition.fields.map((field) => {
      const raw = formData.get(field.name);
      if (field.type === "checkbox") return [field.name, raw === "on"];
      return [field.name, raw === null || raw === "" ? undefined : raw];
    }),
  );
  const parsed = rentalDefinition.schema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted rental fields.",
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
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) {
      throw new Error("Your profile is not active for this organization.");
    }
    if (!isStaffRole(profile.role)) {
      throw new Error("Your role cannot modify rentals.");
    }

    const idValue = formData.get("__id");
    const id =
      typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;

    const startAt = toTimestamptz(String(parsed.data.start_at));
    const expectedReturnAt = toTimestamptz(
      String(parsed.data.expected_return_at),
    );
    payload.start_at = startAt;
    payload.expected_return_at = expectedReturnAt;
    if (typeof payload.actual_return_at === "string" && payload.actual_return_at) {
      payload.actual_return_at = toTimestamptz(payload.actual_return_at);
    }
    if (
      typeof payload.tracking_consent_at === "string" &&
      payload.tracking_consent_at
    ) {
      payload.tracking_consent_at = toTimestamptz(payload.tracking_consent_at);
    }

    const { data: availability, error: availabilityError } = await supabase.rpc(
      "check_vehicle_availability",
      {
        p_vehicle_id: parsed.data.vehicle_id,
        p_start_at: startAt,
        p_expected_return_at: expectedReturnAt,
        p_exclude_rental_id: id ?? null,
      },
    );
    if (availabilityError) throw availabilityError;
    const gate = parseAvailabilityResult(availability);
    if (!gate.available) {
      return {
        success: false,
        message:
          gate.reason ??
          "This vehicle is not available for the selected dates.",
        fieldErrors: { vehicle_id: [gate.reason ?? "Vehicle unavailable"] },
      };
    }

    if (id) {
      const { data: existing, error: existingError } = await supabase
        .from("rentals")
        .select("id, status, reference_number")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw new Error("The rental was not found in your organization.");
      if (isPublicCustomerBooking(existing)) {
        return {
          success: false,
          message:
            "This booking was made by a customer online and cannot be edited. Use workflow actions for status changes and the Payments tab for payment updates.",
        };
      }
      if (existing.status === "completed" || existing.status === "cancelled") {
        delete payload.customer_id;
        delete payload.vehicle_id;
        delete payload.start_at;
        delete payload.expected_return_at;
        delete payload.status;
      }

      const { data, error } = await supabase
        .from("rentals")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The rental was not found in your organization.");
      revalidateResource("/rentals");
      return {
        success: true,
        data: { id, href: `${rentalDefinition.route}/${id}` },
      };
    }

    const { data, error } = await supabase
      .from("rentals")
      .insert({ ...payload, organization_id: profile.organization_id })
      .select("id")
      .single();
    if (error) throw error;
    const savedId = String(data.id);
    revalidateResource("/rentals");
    return {
      success: true,
      data: { id: savedId, href: `${rentalDefinition.route}/${savedId}` },
    };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}
