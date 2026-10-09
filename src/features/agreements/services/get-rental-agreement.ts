import "server-only";

import type { AgreementTerms } from "@/features/agreements/lib/agreement-template";
import type { SignedRentalAgreement } from "@/features/agreements/types";
import { createInspectionSignedUrls } from "@/features/inspections/services/upload-inspection-photo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** The agreement signed at release, or null when the car was released without one. */
export async function getRentalAgreement(
  rentalId: string,
): Promise<SignedRentalAgreement | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rental_agreements")
    .select(
      `
      id,
      rental_id,
      template_version,
      terms,
      company_name,
      company_address,
      company_phone,
      company_email,
      company_signature_path,
      company_signed_by,
      renter_name,
      renter_license_number,
      renter_address,
      renter_signature_path,
      rental_reference,
      vehicle_label,
      plate_number,
      start_at,
      expected_return_at,
      signed_at
    `,
    )
    .eq("rental_id", rentalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [signedUrls, { data: signer }] = await Promise.all([
    createInspectionSignedUrls(supabase, [
      data.company_signature_path,
      data.renter_signature_path,
    ]),
    data.company_signed_by
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.company_signed_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: data.id,
    rentalId: data.rental_id,
    templateVersion: data.template_version,
    terms: data.terms as AgreementTerms,
    parties: {
      companyName: data.company_name,
      companyAddress: data.company_address,
      companyPhone: data.company_phone,
      companyEmail: data.company_email,
      renterName: data.renter_name,
      renterLicenseNumber: data.renter_license_number,
      renterAddress: data.renter_address,
      rentalReference: data.rental_reference,
      vehicleLabel: data.vehicle_label,
      plateNumber: data.plate_number,
      startAt: data.start_at,
      expectedReturnAt: data.expected_return_at,
    },
    companySignatureUrl: signedUrls.get(data.company_signature_path) ?? null,
    renterSignatureUrl: signedUrls.get(data.renter_signature_path) ?? null,
    companySignedByName: signer?.full_name ?? null,
    signedAt: data.signed_at,
  };
}
