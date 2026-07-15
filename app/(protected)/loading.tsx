import { Skeleton } from "@/components/ui/skeleton";

export default function ProtectedLoading() {
  return (
    <div aria-label="Loading workspace" className="space-y-8" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-36 rounded-lg" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-[430px] rounded-lg xl:col-span-8" />
        <Skeleton className="h-[430px] rounded-lg xl:col-span-4" />
      </div>
      <span className="sr-only">Loading dashboard content</span>
    </div>
  );
}
