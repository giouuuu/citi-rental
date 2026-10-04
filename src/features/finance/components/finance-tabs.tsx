"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/expenses", label: "Expenses" },
  { href: "/finance/assets", label: "Fixed assets" },
  { href: "/finance/report", label: "Accountant report" },
  { href: "/finance/withholding", label: "2307 certificates" },
  { href: "/finance/settings", label: "Tax settings" },
];

/** Section links shared by every /finance page. */
export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Finance sections" className="-mt-2 overflow-x-auto border-b print:hidden">
      <ul className="flex min-w-max gap-1">
        {SECTIONS.map((section) => {
          const active =
            section.href === "/finance"
              ? pathname === "/finance"
              : pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                href={section.href}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
