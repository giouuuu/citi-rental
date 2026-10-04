import { Skeleton } from "@/components/ui/skeleton";
import { KpiSkeleton, PanelSkeleton } from "@/features/analytics/components/panel-skeleton";

export function FinanceStatementSkeleton() {
  return (
    <div className="space-y-8">
      <KpiSkeleton />
      <PanelSkeleton className="h-[520px]" label="gross receipts" />
      <PanelSkeleton className="h-[420px]" label="income statement" />
    </div>
  );
}

export function FinanceSkeleton() {
  return (
    <div aria-label="Loading the financial statement" className="space-y-6" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-14 w-44" key={index} />
        ))}
      </div>
      <FinanceStatementSkeleton />
      <span className="sr-only">Loading the financial statement</span>
    </div>
  );
}
