import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
