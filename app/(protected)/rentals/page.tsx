import { rentalDefinition } from "@/features/rentals";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={rentalDefinition}
      searchParams={searchParams}
    />
  );
}
