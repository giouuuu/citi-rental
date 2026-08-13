import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ResourceQuery } from "@/features/shared/types/resource";

function PageButton({
  children,
  disabled,
  href,
  label,
  onNavigate,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  label: string;
  onNavigate: (href: string) => void;
}) {
  // A `<Button asChild disabled>` renders the Link *as* the button, and
  // `disabled` is not a valid attribute on an anchor — it is dropped silently
  // and the control stays clickable. Render a real button instead.
  if (disabled) {
    return (
      <Button aria-label={label} disabled variant="outline">
        {children}
      </Button>
    );
  }

  // The href stays real so middle-click and copy-link still work; the handler
  // routes the normal click through the shared transition.
  return (
    <Button asChild variant="outline">
      <Link
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onNavigate(href);
        }}
      >
        {children}
      </Link>
    </Button>
  );
}

export function ResourceTablePagination({
  hasNextPage,
  isPending,
  onNavigate,
  page,
  plural,
  query,
  rowCount,
  urlFor,
}: {
  hasNextPage: boolean;
  isPending: boolean;
  onNavigate: (href: string) => void;
  page: number;
  plural: string;
  query: ResourceQuery;
  rowCount: number;
  urlFor: (changes: Partial<ResourceQuery>) => string;
}) {
  const items = plural.toLowerCase();
  // `hasNextPage` is all we know, so this is a page count and must be worded as
  // one — there is no total to report.
  const summary = query.q
    ? `${rowCount} ${items} matching “${query.q}” on page ${page}`
    : `${rowCount} ${items} on page ${page}`;

  return (
    <div className="flex items-center justify-between gap-3">
      <p
        aria-atomic="true"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {summary}
      </p>
      <div className="flex gap-2">
        <PageButton
          disabled={page <= 1 || isPending}
          href={urlFor({ page: page - 1 })}
          label="Previous page"
          onNavigate={onNavigate}
        >
          <ChevronLeft /> Previous
        </PageButton>
        <PageButton
          disabled={!hasNextPage || isPending}
          href={urlFor({ page: page + 1 })}
          label="Next page"
          onNavigate={onNavigate}
        >
          Next <ChevronRight />
        </PageButton>
      </div>
    </div>
  );
}
