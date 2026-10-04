"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Label } from "@/components/ui/label";
import {
  financeUrl,
  MAX_FINANCE_DAYS,
  type FinancePeriodOption,
} from "@/features/finance/lib/finance-period";
import { DateRangePicker, useDebouncedNavigation } from "@/features/shared/client";
import { cn } from "@/lib/utils";

/**
 * Period picker plus the statement it drives. A preset keeps its short
 * `?period=` code; custom dates pin `from` and `to`. While the server rebuilds
 * the statement the old one stays on screen, dimmed, under the reserved bar.
 */
export function FinanceFrame({
  period,
  defaultPeriod,
  options,
  from,
  to,
  summary,
  pathname,
  children,
}: {
  pathname: string;
  period: string | null;
  defaultPeriod: string;
  options: FinancePeriodOption[];
  from: string;
  to: string;
  summary: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigateNow } = useDebouncedNavigation();
  const current = () => new URLSearchParams(searchParams.toString());

  return (
    <div className="space-y-6">
      <div className="space-y-2 print:hidden">
        <div className="grid w-fit gap-1.5">
          <Label htmlFor="finance-period">Period</Label>
          <DateRangePicker
            activePreset={period}
            id="finance-period"
            maxDays={MAX_FINANCE_DAYS}
            onSelect={({ from: nextFrom, to: nextTo, preset }) =>
              navigateNow(
                financeUrl(
                  current(),
                  preset ? { period: preset.value } : { custom: { from: nextFrom, to: nextTo } },
                  defaultPeriod,
                  pathname,
                ),
              )
            }
            presets={options}
            value={{ from, to }}
          />
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {summary}
        </p>
        <DataTableLoadingBar pending={isPending} />
      </div>
      <div
        aria-busy={isPending}
        className={cn("space-y-8 transition-opacity", isPending && "pointer-events-none opacity-60")}
      >
        {children}
      </div>
    </div>
  );
}
