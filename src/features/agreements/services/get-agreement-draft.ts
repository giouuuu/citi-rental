import "server-only";

import { buildAgreementTerms } from "@/features/agreements/lib/agreement-template";
import type { AgreementDraft } from "@/features/agreements/types";
import { createInspectionSignedUrls } from "@/features/inspections/services/upload-inspection-photo";
import { DEFAULT_FREE_CANCELLATION_HOURS } from "@/features/rentals/lib/cancellation-policy";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** The company's printed details and saved signature, from Settings. */
export async function getAgreementCompany() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_profile")
    .select(
      "name, legal_name, business_address, contact_phone, contact_email, agreement_signature_path, free_cancellation_hours",
    )
    .single();
  if (error) throw new Error(error.message);
  return {
    name: (data.legal_name?.trim() || data.name) as string,
    address: data.business_address as string | null,
    phone: data.contact_phone as string | null,
    email: data.contact_email as string | null,
    signaturePath: data.agreement_signature_path as string | null,
    freeCancellationHours:
      data.free_cancellation_hours != null
        ? Number(data.free_cancellation_hours)
        : DEFAULT_FREE_CANCELLATION_HOURS,
  };
}

/**
 * The agreement prefilled for a rental about to be released: renter, car,
 * dates and company details, ready for the renter to sign.
 */
export async function getAgreementDraft(
  rentalId: string,
): Promise<AgreementDraft | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const [{ data: rental }, company] = await Promise.all([
    supabase
      .from("rentals")
      .select(
        `
        reference_number,
        start_at,
        expected_return_at,
        customers ( full_name, drivers_license_number, address ),
        vehicles ( name, make, model, plate_number )
      `,
      )
      .eq("id", rentalId)
      .maybeSingle(),
    getAgreementCompany(),
  ]);
  if (!rental) return null;

  const customer = one(
    rental.customers as
      | { full_name: string; drivers_license_number: string; address: string | null }
      | { full_name: string; drivers_license_number: string; address: string | null }[]
      | null,
  );
  const vehicle = one(
    rental.vehicles as
      | { name: string; make: string; model: string; plate_number: string }
      | { name: string; make: string; model: string; plate_number: string }[]
      | null,
  );

  const signatureUrl = company.signaturePath
    ? ((await createInspectionSignedUrls(supabase, [company.signaturePath])).get(
        company.signaturePath,
      ) ?? null)
    : null;

  return {
    parties: {
      companyName: company.name,
      companyAddress: company.address,
      companyPhone: company.phone,
      companyEmail: company.email,
      renterName: customer?.full_name ?? "",
      renterLicenseNumber: customer?.drivers_license_number ?? "",
      renterAddress: customer?.address?.trim() || null,
      rentalReference: rental.reference_number ? String(rental.reference_number) : null,
      vehicleLabel:
        vehicle?.name?.trim() ||
        [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") ||
        null,
      plateNumber: vehicle?.plate_number ?? null,
      startAt: rental.start_at ? String(rental.start_at) : null,
      expectedReturnAt: rental.expected_return_at
        ? String(rental.expected_return_at)
        : null,
    },
    terms: buildAgreementTerms({
      freeCancellationHours: company.freeCancellationHours,
    }),
    companySignatureUrl: signatureUrl,
  };
}
