import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div aria-label="Loading dashboard" className="space-y-8" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className="h-36 rounded-lg" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-lg xl:col-span-8" />
        <Skeleton className="h-80 rounded-lg xl:col-span-4" />
      </div>
      <Skeleton className="h-[32rem] rounded-lg" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-72 rounded-lg xl:col-span-8" />
        <Skeleton className="h-72 rounded-lg xl:col-span-4" />
      </div>
      <span className="sr-only">Loading dashboard content</span>
    </div>
  );
}
