import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((item, index) => (
                <li className="flex items-center gap-1" key={item.label}>
                  {index > 0 ? <ChevronRight className="size-3.5" /> : null}
                  {item.href ? (
                    <Link className="hover:text-foreground" href={item.href}>
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h1 className="text-[1.75rem] leading-9 font-bold tracking-[-0.025em] text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
