import { Skeleton } from "@/components/ui/skeleton";
import { KpiSkeleton } from "@/features/analytics/components/panel-skeleton";

export function AnalyticsSkeleton() {
  return (
    <div aria-label="Loading analytics" className="space-y-6" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-9 w-full max-w-lg" />
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton className="h-14 w-40" key={index} />
        ))}
      </div>
      <KpiSkeleton />
      <Skeleton className="h-[420px] rounded-lg" />
      <span className="sr-only">Loading analytics</span>
    </div>
  );
}
