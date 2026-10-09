import { reviewDefinition } from "@/features/reviews";
import { ResourceIndexScreen } from "@/features/shared";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={reviewDefinition}
      searchParams={searchParams}
    />
  );
}
