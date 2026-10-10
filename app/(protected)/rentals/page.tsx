import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { rentalDefinition, sweepOverdueRentals } from "@/features/rentals";
import { RentalsAttentionTable } from "@/features/rentals/components/rentals-attention-table";
import { listRentalsNeedingAttention } from "@/features/rentals/services/list-rentals-needing-attention";
import { ResourceIndexScreen } from "@/features/shared";

async function RentalsAttention() {
  return <RentalsAttentionTable rentals={await listRentalsNeedingAttention()} />;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await sweepOverdueRentals();

  return (
    <ResourceIndexScreen
      beforeTable={
        // Its own panel: the list paints without waiting on the to-do query.
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <RentalsAttention />
        </Suspense>
      }
      definition={rentalDefinition}
      searchParams={searchParams}
    />
  );
}
