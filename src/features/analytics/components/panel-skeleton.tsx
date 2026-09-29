import { Skeleton } from "@/components/ui/skeleton";

export function PanelSkeleton({ label, className = "h-80" }: { label: string; className?: string }) {
  return (
    <div aria-label={`Loading ${label}`} role="status">
      <Skeleton className={`${className} w-full rounded-lg`} />
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div aria-label="Loading headline numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton className="h-32 rounded-lg" key={index} />
      ))}
    </div>
  );
}
