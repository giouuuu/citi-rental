import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ResourceQuery } from "@/features/shared/types/resource";

export function resourceTableUrl(
  route: string,
  query: ResourceQuery,
  changes: Partial<ResourceQuery>,
) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams({
    q: next.q,
    page: String(next.page),
    page_size: String(next.pageSize),
    sort: next.sort,
    direction: next.direction,
  });
  return `${route}?${params.toString()}`;
}

export function ResourceTablePagination({
  hasNextPage,
  isPending,
  page,
  pageSize,
  query,
  route,
}: {
  hasNextPage: boolean;
  isPending: boolean;
  page: number;
  pageSize: number;
  query: ResourceQuery;
  route: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Page {page} · Up to {pageSize} records
      </p>
      <div className="flex gap-2">
        <Button
          asChild={page > 1}
          disabled={page <= 1 || isPending}
          variant="outline"
        >
          {page > 1 ? (
            <Link href={resourceTableUrl(route, query, { page: page - 1 })}>
              <ChevronLeft /> Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft /> Previous
            </span>
          )}
        </Button>
        <Button
          asChild={hasNextPage}
          disabled={!hasNextPage || isPending}
          variant="outline"
        >
          {hasNextPage ? (
            <Link href={resourceTableUrl(route, query, { page: page + 1 })}>
              Next <ChevronRight />
            </Link>
          ) : (
            <span>
              Next <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
