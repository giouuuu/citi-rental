import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape-matched fallback for the resource index routes. Single-sourced so each
 * route's `loading.tsx` is a three-line re-export rather than duplicated markup.
 *
 * This fires on route change only. Refining an already-visible list (search,
 * sort, page) uses the in-place loading bar instead — see `DataTableLoadingBar`.
 */
export function ResourceListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-label="Loading records" className="space-y-6" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-9 w-full max-w-md" />
            <Skeleton className="h-9 w-28 shrink-0" />
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Skeleton className="h-11 rounded-none" />
            <div className="divide-y divide-border">
              {Array.from({ length: rows }).map((_, index) => (
                <div className="flex h-14 items-center px-4" key={index}>
                  <Skeleton className="h-4 w-full max-w-[60%]" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-48" />
          </div>
        </CardContent>
      </Card>
      <span className="sr-only">Loading records</span>
    </div>
  );
}
