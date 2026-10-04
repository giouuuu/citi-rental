import { withholdingCertificateDefinition } from "@/features/finance";
import { ResourceIndexScreen } from "@/features/shared";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ResourceIndexScreen definition={withholdingCertificateDefinition} searchParams={searchParams} />;
}
