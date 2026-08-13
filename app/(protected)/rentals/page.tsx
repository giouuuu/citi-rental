import { rentalDefinition, sweepOverdueRentals } from "@/features/rentals";
import { ResourceIndexScreen } from "@/features/shared";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await sweepOverdueRentals();

  return (
    <ResourceIndexScreen
      definition={rentalDefinition}
      searchParams={searchParams}
    />
  );
}
