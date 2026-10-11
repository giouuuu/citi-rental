import "server-only";

import {
  AGREEMENT_TEMPLATE_VERSION,
  type AgreementTemplate,
  DEFAULT_AGREEMENT_TEMPLATE,
} from "@/features/agreements/lib/agreement-template";
import { parseAgreementTemplate } from "@/features/agreements/schemas/agreement-template-schema";
import type { AgreementParties } from "@/features/agreements/types";
import { DEFAULT_FREE_CANCELLATION_HOURS } from "@/features/rentals/lib/cancellation-policy";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AgreementTemplateSettings = {
  template: AgreementTemplate;
  /** False while the built-in wording is in use. */
  isCustom: boolean;
  version: string;
  freeCancellationHours: number;
  /** Sample details for the preview: the real company, a made-up renter. */
  sampleParties: AgreementParties;
};

/** The agreement wording Settings edits, saved or built-in. */
export async function getAgreementTemplateSettings(): Promise<AgreementTemplateSettings> {
  const sampleParties: AgreementParties = {
    companyName: "Zeke's Car Rental Services",
    companyAddress: null,
    companyPhone: null,
    companyEmail: null,
    renterName: "Juan Dela Cruz",
    renterLicenseNumber: "N01-23-456789",
    renterAddress: "Lahug, Cebu City",
    rentalReference: "SAMPLE",
    vehicleLabel: "Toyota Vios",
    plateNumber: "ABC 1234",
    startAt: null,
    expectedReturnAt: null,
  };
  const fallback: AgreementTemplateSettings = {
    template: DEFAULT_AGREEMENT_TEMPLATE,
    isCustom: false,
    version: AGREEMENT_TEMPLATE_VERSION,
    freeCancellationHours: DEFAULT_FREE_CANCELLATION_HOURS,
    sampleParties,
  };
  if (!isSupabaseConfigured()) return fallback;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_profile")
    .select(
      "name, legal_name, business_address, contact_phone, contact_email, free_cancellation_hours, agreement_template, agreement_template_version",
    )
    .single();
  if (error) throw new Error(error.message);

  const saved = parseAgreementTemplate(data.agreement_template);
  return {
    template: saved ?? DEFAULT_AGREEMENT_TEMPLATE,
    isCustom: Boolean(saved),
    version: (saved && (data.agreement_template_version as string | null)) || AGREEMENT_TEMPLATE_VERSION,
    freeCancellationHours:
      data.free_cancellation_hours != null
        ? Number(data.free_cancellation_hours)
        : DEFAULT_FREE_CANCELLATION_HOURS,
    sampleParties: {
      ...sampleParties,
      companyName: (data.legal_name as string | null)?.trim() || data.name,
      companyAddress: data.business_address as string | null,
      companyPhone: data.contact_phone as string | null,
      companyEmail: data.contact_email as string | null,
    },
  };
}
