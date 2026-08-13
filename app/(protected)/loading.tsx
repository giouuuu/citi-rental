import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shell-level fallback for protected routes that have no closer boundary.
 * Deliberately generic — a dashboard-shaped skeleton on a table route flashes a
 * layout that never materialises. Route families carry their own `loading.tsx`.
 */
export default function ProtectedLoading() {
  return (
    <div aria-label="Loading workspace" className="space-y-6" role="status">
      <div className="space-y-3 border-b border-border pb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-80 rounded-lg" />
      <span className="sr-only">Loading workspace content</span>
    </div>
  );
}
