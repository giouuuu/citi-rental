import { alertDefinition } from "@/features/alerts";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <ResourceIndexScreen
      definition={alertDefinition}
      searchParams={searchParams}
    />
  );
}
