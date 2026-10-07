import "server-only";

import { PAYMENT_PROOFS_BUCKET } from "@/features/booking/lib/upload-payment-proof";
import type {
  PaymentEntryStatus,
  PaymentType,
  RentalPayment,
} from "@/features/rentals/types/rental-payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type ChargeTypeRef = { name: string; code: string | null };

type PaymentRow = {
  id: string;
  rental_id: string;
  payment_type: PaymentType;
  amount: number | string;
  currency: string;
  method: string | null;
  status: PaymentEntryStatus;
  external_reference: string | null;
  proof_path: string | null;
  notes: string | null;
  submitted_at: string;
  confirmed_at: string | null;
  rental_charge_types: ChargeTypeRef | ChargeTypeRef[] | null;
};

export async function listRentalPayments(
  rentalId: string,
): Promise<RentalPayment[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, rental_id, payment_type, amount, currency, method, status, external_reference, proof_path, notes, submitted_at, confirmed_at, rental_charge_types ( name, code )",
    )
    .eq("rental_id", rentalId)
    .neq("status", "cancelled")
    .order("submitted_at", { ascending: false });

  if (error || !data) {
    console.error("listRentalPayments failed", error?.message);
    return [];
  }

  const rows = data as unknown as PaymentRow[];
  return Promise.all(
    rows.map(async (row) => {
      let proofUrl: string | null = null;
      if (row.proof_path) {
        const { data: signed } = await supabase.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .createSignedUrl(row.proof_path, 60 * 30);
        proofUrl = signed?.signedUrl ?? null;
      }
      const chargeType = Array.isArray(row.rental_charge_types)
        ? row.rental_charge_types[0]
        : row.rental_charge_types;
      return {
        id: row.id,
        rentalId: row.rental_id,
        paymentType: row.payment_type,
        amount: Number(row.amount),
        currency: row.currency,
        method: row.method,
        status: row.status,
        externalReference: row.external_reference,
        proofPath: row.proof_path,
        proofUrl,
        notes: row.notes,
        submittedAt: row.submitted_at,
        confirmedAt: row.confirmed_at,
        chargeTypeName: chargeType?.name ?? null,
        chargeTypeCode: chargeType?.code ?? null,
      } satisfies RentalPayment;
    }),
  );
}
