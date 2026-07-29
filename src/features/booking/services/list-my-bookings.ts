import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerBooking,
  CustomerBookingStatus,
  RentalPaymentStatus,
} from "@/features/booking/types/customer-booking";

type ListMyBookingsRow = {
  id: string;
  reference_number: string;
  status: CustomerBookingStatus;
  payment_status: RentalPaymentStatus;
  start_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  pickup_location: string | null;
  return_location: string | null;
  vehicle_id: string;
  vehicle_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_photo_url: string | null;
  quoted_total: number | string | null;
  deposit_amount: number | string | null;
  balance_due: number | string | null;
  created_at: string;
};

function mapRow(row: ListMyBookingsRow): CustomerBooking {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    status: row.status,
    paymentStatus: row.payment_status ?? "unpaid",
    startAt: row.start_at,
    expectedReturnAt: row.expected_return_at,
    actualReturnAt: row.actual_return_at,
    pickupLocation: row.pickup_location,
    returnLocation: row.return_location,
    vehicleId: row.vehicle_id,
    vehicleName: row.vehicle_name,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehiclePhotoUrl: row.vehicle_photo_url,
    quotedTotal:
      row.quoted_total == null ? null : Number(row.quoted_total),
    depositAmount:
      row.deposit_amount == null ? null : Number(row.deposit_amount),
    balanceDue: row.balance_due == null ? null : Number(row.balance_due),
    createdAt: row.created_at,
  };
}

export async function listMyBookings(): Promise<CustomerBooking[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_bookings");

  if (error) {
    console.error("list_my_bookings failed", error.message);
    return [];
  }

  if (!data) return [];

  return (data as ListMyBookingsRow[]).map(mapRow);
}
