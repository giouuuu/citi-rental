import Link from "next/link";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RENTAL_STATUSES,
  RENTAL_STATUS_LABELS,
  RENTAL_STATUS_NOTES,
  type RentalStatusCounts,
} from "@/features/rentals/lib/rental-status-counts";
import { rentalDefinition } from "@/features/rentals/schemas/rental-definition";
import { resolveFallbackSort, resourceTableUrl } from "@/features/shared/lib/resource-table-url";
import type { ResourceQuery } from "@/features/shared/types/resource";
import { cn } from "@/lib/utils";

/**
 * One card per rental status with its count. A card is also the status
 * filter: clicking it shows only those rentals, clicking it again clears it.
 */
export function RentalStatusKpis({
  counts,
  query,
}: {
  counts: RentalStatusCounts;
  query: ResourceQuery;
}) {
  const selected = query.filters?.status;
  const fallbackSort = resolveFallbackSort(rentalDefinition.columns);
  const hrefFor = (status: string) => {
    const filters = { ...query.filters };
    if (selected === status) delete filters.status;
    else filters.status = status;
    return resourceTableUrl(rentalDefinition.route, query, { filters }, fallbackSort);
  };

  return (
    <section
      aria-labelledby="rental-status-kpis"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      <h2 className="sr-only" id="rental-status-kpis">
        Rentals by status
      </h2>
      {RENTAL_STATUSES.map((status) => {
        const active = selected === status;
        const label = RENTAL_STATUS_LABELS[status];
        return (
          <Link
            aria-current={active ? "true" : undefined}
            className="rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            href={hrefFor(status)}
            key={status}
            replace
            scroll={false}
          >
            <Card
              className={cn(
                "h-full transition-[border-color,box-shadow] duration-150 hover:border-brand-100 hover:shadow-sm",
                active && "border-primary ring-1 ring-primary",
              )}
            >
              <CardContent className="space-y-3">
                <StatusBadge label={label} status={status} />
                <p className="text-2xl leading-none font-bold tracking-tight tabular-nums">
                  {counts[status].toLocaleString("en-PH")}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {RENTAL_STATUS_NOTES[status]}
                  <span className="sr-only">
                    {active ? ". Selected — click to show all statuses." : `. Show only ${label.toLowerCase()} rentals.`}
                  </span>
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}

/** Holds the cards' height while the counts load. */
export function RentalStatusKpisSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {RENTAL_STATUSES.map((status) => (
        <Skeleton className="h-[118px] rounded-xl" key={status} />
      ))}
    </div>
  );
}
