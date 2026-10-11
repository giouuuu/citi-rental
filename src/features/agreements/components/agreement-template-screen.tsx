import { PageHeader } from "@/components/design-system/page-header";
import { AgreementTemplateEditor } from "@/features/agreements/components/agreement-template-editor";
import { getAgreementTemplateSettings } from "@/features/agreements/services/get-agreement-template-settings";

export async function AgreementTemplateScreen() {
  const settings = await getAgreementTemplateSettings();
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Rental agreement" },
        ]}
        description="The terms renters accept when booking and sign at release. Edit the wording, add or remove clauses and sections. Agreements already signed keep the wording they were signed with."
        title="Rental agreement"
      />
      {/* A new version remounts the editor with what was saved. */}
      <AgreementTemplateEditor key={settings.version} settings={settings} />
    </div>
  );
}
