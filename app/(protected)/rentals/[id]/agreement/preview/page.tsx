import { notFound } from "next/navigation";

import { AgreementPreview } from "@/features/agreements/components/agreement-preview";
import { getAgreementDraft } from "@/features/agreements/services/get-agreement-draft";

export default async function RentalAgreementPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await getAgreementDraft(id);
  if (!draft) notFound();

  return (
    <main className="min-h-screen bg-background">
      <AgreementPreview draft={draft} previewedAt={new Date().toISOString()} />
    </main>
  );
}
