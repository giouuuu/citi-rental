import { withholdingCertificateDefinition, saveWithholdingCertificateAction } from "@/features/finance";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return <ResourceCreateScreen action={saveWithholdingCertificateAction} definition={withholdingCertificateDefinition} />;
}
