import { notFound } from "next/navigation";

import { AgreementDocument } from "@/features/agreements/components/agreement-document";
import { getRentalAgreement } from "@/features/agreements/services/get-rental-agreement";
import { PrintReportButton } from "@/features/inspections/components/print-report-button";
import { formatManila } from "@/features/shared/lib/manila-time";

export default async function RentalAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agreement = await getRentalAgreement(id);
  if (!agreement) notFound();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 p-4 print:hidden">
        <p className="text-xs text-muted-foreground">
          Signed {formatManila(agreement.signedAt, "stamp")}
          {agreement.companySignedByName
            ? ` · released by ${agreement.companySignedByName}`
            : ""}{" "}
          · template {agreement.templateVersion}
        </p>
        <PrintReportButton />
      </div>
      <AgreementDocument
        className="mx-auto max-w-3xl p-6 print:p-0"
        companySignatureUrl={agreement.companySignatureUrl}
        parties={agreement.parties}
        renterSignatureUrl={agreement.renterSignatureUrl}
        signedAt={agreement.signedAt}
        terms={agreement.terms}
      />
    </main>
  );
}
