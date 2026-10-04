import {
  saveWithholdingCertificateAction,
  withholdingCertificateDefinition,
} from "@/features/finance";
import { ResourceDetailScreen } from "@/features/shared";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <ResourceDetailScreen
      action={saveWithholdingCertificateAction}
      definition={withholdingCertificateDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
