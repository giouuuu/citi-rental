import "server-only";

import { createInspectionSignedUrls } from "@/features/inspections/services/upload-inspection-photo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AgreementSettings = {
  legalName: string;
  businessAddress: string;
  contactEmail: string;
  signatureUrl: string | null;
};

/** What Settings shows for the rental agreement; null in demo mode. */
export async function getAgreementSettings(): Promise<AgreementSettings | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_profile")
    .select("name, legal_name, business_address, contact_email, agreement_signature_path")
    .single();
  if (error) throw new Error(error.message);

  const path = data.agreement_signature_path as string | null;
  const signatureUrl = path
    ? ((await createInspectionSignedUrls(supabase, [path])).get(path) ?? null)
    : null;

  return {
    legalName: (data.legal_name as string | null) ?? data.name,
    businessAddress: (data.business_address as string | null) ?? "",
    contactEmail: (data.contact_email as string | null) ?? "",
    signatureUrl,
  };
}
