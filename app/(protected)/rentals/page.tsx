import { Suspense } from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rentalDefinition, sweepOverdueRentals } from "@/features/rentals";
import {
  RentalStatusKpis,
  RentalStatusKpisSkeleton,
} from "@/features/rentals/components/rental-status-kpis";
import { RentalsAttentionTable } from "@/features/rentals/components/rentals-attention-table";
import { countRentalsByStatus } from "@/features/rentals/services/count-rentals-by-status";
import { listRentalsNeedingAttention } from "@/features/rentals/services/list-rentals-needing-attention";
import { ResourceIndexScreen } from "@/features/shared";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import type { ResourceQuery } from "@/features/shared/types/resource";

async function RentalsAttention() {
  return <RentalsAttentionTable rentals={await listRentalsNeedingAttention()} />;
}

async function RentalStatusCounts({ query }: { query: ResourceQuery }) {
  const counts = await countRentalsByStatus(query);
  return counts ? <RentalStatusKpis counts={counts} query={query} /> : null;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await sweepOverdueRentals();
  const query = parseResourceQuery(await searchParams, rentalDefinition);

  return (
    <ResourceIndexScreen
      beforeTable={
        // Their own panels: the list paints without waiting on these queries.
        <>
          <Suspense fallback={<RentalStatusKpisSkeleton />}>
            <RentalStatusCounts query={query} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
            <RentalsAttention />
          </Suspense>
        </>
      }
      definition={rentalDefinition}
      headerActions={
        <Button asChild variant="outline">
          <Link href="/rentals/past">
            <History /> Record past rental
          </Link>
        </Button>
      }
      searchParams={searchParams}
    />
  );
}
