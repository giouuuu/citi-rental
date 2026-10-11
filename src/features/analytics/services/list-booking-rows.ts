import "server-only";

import { demoBookingRows } from "@/features/analytics/lib/demo-analytics";
import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type { AnalyticsResult, BookingRow } from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type BookingRpcRow = {
  rental_id: string;
  reference_number: string;
  status: BookingRow["status"];
  booking_source: string;
  with_driver: boolean | null;
  payment_status: string | null;
  created_at: string;
  start_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_name: string | null;
  vehicle_category: string | null;
  pickup_location: string | null;
  destination: string | null;
  quoted_total: number | string | null;
  deposit_amount: number | string | null;
  paid: number | string;
  refunded: number | string;
  first_proof_at: string | null;
  first_paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  reservation_fee_forfeited: boolean | null;
  cancelled_by: "customer" | "staff" | null;
  paid_before_cancel: number | string;
  proof_before_cancel: boolean | null;
};

const moneyOrNull = (value: number | string | null) => (value === null ? null : toMoney(value));

/** Every booking made or cancelled in the window, newest first. */
export async function listBookingRows(
  from: string,
  to: string,
): Promise<AnalyticsResult<BookingRow[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: true, data: demoBookingRows(buildDemoWorkspace(), from, to) };
  }

  return runAnalyticsRpc<BookingRpcRow, BookingRow[]>(
    "analytics_booking_rows",
    { p_from: from, p_to: to },
    (rows) =>
      rows.map((row) => ({
        rentalId: row.rental_id,
        referenceNumber: row.reference_number,
        status: row.status,
        bookingSource: row.booking_source,
        withDriver: Boolean(row.with_driver),
        paymentStatus: row.payment_status,
        createdAt: row.created_at,
        startAt: row.start_at,
        expectedReturnAt: row.expected_return_at,
        actualReturnAt: row.actual_return_at,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        vehicleId: row.vehicle_id,
        vehiclePlate: row.vehicle_plate,
        vehicleName: row.vehicle_name,
        vehicleCategory: row.vehicle_category,
        pickupLocation: row.pickup_location,
        destination: row.destination,
        quotedTotal: moneyOrNull(row.quoted_total),
        depositAmount: moneyOrNull(row.deposit_amount),
        paid: toMoney(row.paid),
        refunded: toMoney(row.refunded),
        firstProofAt: row.first_proof_at,
        firstPaidAt: row.first_paid_at,
        cancelledAt: row.cancelled_at,
        cancellationReason: row.cancellation_reason,
        cancellationNote: row.cancellation_note,
        reservationFeeForfeited: row.reservation_fee_forfeited,
        cancelledBy: row.cancelled_by,
        paidBeforeCancel: toMoney(row.paid_before_cancel),
        proofBeforeCancel: Boolean(row.proof_before_cancel),
      })),
  );
}
