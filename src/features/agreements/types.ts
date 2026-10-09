import type { AgreementTerms } from "@/features/agreements/lib/agreement-template";

/** Who signs and what is rented — printed on the agreement. */
export type AgreementParties = {
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  renterName: string;
  renterLicenseNumber: string;
  renterAddress: string | null;
  rentalReference: string | null;
  vehicleLabel: string | null;
  plateNumber: string | null;
  startAt: string | null;
  expectedReturnAt: string | null;
};

/** The agreement as it will read at release, before anyone signs. */
export type AgreementDraft = {
  parties: AgreementParties;
  terms: AgreementTerms;
  /** The saved company e-signature from Settings, if any. */
  companySignatureUrl: string | null;
};

/** A signed agreement, read back from `rental_agreements`. */
export type SignedRentalAgreement = {
  id: string;
  rentalId: string;
  templateVersion: string;
  terms: AgreementTerms;
  parties: AgreementParties;
  companySignatureUrl: string | null;
  renterSignatureUrl: string | null;
  companySignedByName: string | null;
  signedAt: string;
};
