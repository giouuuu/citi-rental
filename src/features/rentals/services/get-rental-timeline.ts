import "server-only";

import {
  buildRentalTimeline,
  type RentalTimelineAuditEntry,
  type RentalTimelineEvent,
  type RentalTimelinePayment,
} from "@/features/rentals/lib/rental-timeline";
import type {
  PaymentEntryStatus,
  PaymentType,
} from "@/features/rentals/types/rental-payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type JsonObject = Record<string, unknown> | null;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type ChargeTypeRef = { name: string };

/** Everything that happened on a rental, oldest first, then what is coming. */
export async function getRentalTimeline(
  rentalId: string,
): Promise<RentalTimelineEvent[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const [rentalResult, auditResult, paymentResult] = await Promise.all([
    supabase
      .from("rentals")
      .select(
        "status, booking_source, created_at, created_by, start_at, expected_return_at, cancelled_at",
      )
      .eq("id", rentalId)
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("id, action, created_at, actor_profile_id, old_data, new_data, metadata")
      .eq("resource_type", "rental")
      .eq("resource_id", rentalId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select(
        "id, payment_type, amount, status, method, notes, submitted_at, confirmed_at, confirmed_by, rejected_at, rejected_by, updated_at, rental_charge_types ( name )",
      )
      .eq("rental_id", rentalId)
      .order("submitted_at", { ascending: true }),
  ]);

  const rental = rentalResult.data;
  if (rentalResult.error || !rental) {
    if (rentalResult.error) {
      console.error("getRentalTimeline rental failed", rentalResult.error.message);
    }
    return [];
  }
  if (auditResult.error) {
    console.error("getRentalTimeline audit failed", auditResult.error.message);
  }
  if (paymentResult.error) {
    console.error("getRentalTimeline payments failed", paymentResult.error.message);
  }
  const auditRows = auditResult.data ?? [];
  const paymentRows = paymentResult.data ?? [];

  const actorIds = new Set<string>();
  if (rental.created_by) actorIds.add(rental.created_by);
  for (const row of auditRows) if (row.actor_profile_id) actorIds.add(row.actor_profile_id);
  for (const row of paymentRows) {
    if (row.confirmed_by) actorIds.add(row.confirmed_by);
    if (row.rejected_by) actorIds.add(row.rejected_by);
  }

  const names = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...actorIds]);
    for (const profile of profiles ?? []) {
      const name = profile.full_name?.trim() || profile.email?.trim();
      if (name) names.set(profile.id, name);
    }
  }
  const nameOf = (id: string | null | undefined) =>
    id ? (names.get(id) ?? null) : null;

  const audit: RentalTimelineAuditEntry[] = auditRows.map((row) => ({
    id: row.id,
    action: row.action,
    createdAt: row.created_at,
    actorName: nameOf(row.actor_profile_id),
    oldData: asObject(row.old_data),
    newData: asObject(row.new_data),
    metadata: asObject(row.metadata),
  }));

  const payments: RentalTimelinePayment[] = paymentRows.map((row) => {
    const chargeType = (
      Array.isArray(row.rental_charge_types)
        ? row.rental_charge_types[0]
        : row.rental_charge_types
    ) as ChargeTypeRef | null | undefined;
    return {
      id: row.id,
      paymentType: row.payment_type as PaymentType,
      amount: Number(row.amount),
      status: row.status as PaymentEntryStatus,
      method: row.method,
      chargeTypeName: chargeType?.name ?? null,
      notes: row.notes,
      submittedAt: row.submitted_at,
      confirmedAt: row.confirmed_at,
      confirmedByName: nameOf(row.confirmed_by),
      rejectedAt: row.rejected_at,
      rejectedByName: nameOf(row.rejected_by),
      updatedAt: row.updated_at,
    };
  });

  return buildRentalTimeline({
    rental: {
      status: String(rental.status),
      bookingSource: rental.booking_source,
      createdAt: rental.created_at,
      createdByName: nameOf(rental.created_by),
      startAt: rental.start_at,
      expectedReturnAt: rental.expected_return_at,
      cancelledAt: rental.cancelled_at,
    },
    audit,
    payments,
  });
}
