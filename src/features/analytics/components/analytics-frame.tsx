"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  analyticsUrl,
  isPreset,
  MAX_ANALYTICS_DAYS,
} from "@/features/analytics/lib/analytics-window";
import type { AnalyticsBucket, AnalyticsPreset } from "@/features/analytics/types/analytics";
import {
  DateRangePicker,
  useDebouncedNavigation,
  type DateRangePreset,
} from "@/features/shared/client";
import { cn } from "@/lib/utils";

const BUCKET_OPTIONS: { value: AnalyticsBucket | "auto"; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

/**
 * Filter bar plus the panels it drives. Filters auto-apply through
 * `useDebouncedNavigation`; while the server re-renders, the previous panels
 * stay on screen dimmed and the reserved 2px bar shows progress.
 */
export function AnalyticsFrame({
  preset,
  presets,
  today,
  from,
  to,
  bucket,
  bucketIsExplicit,
  summary,
  children,
}: {
  preset: AnalyticsPreset;
  presets: DateRangePreset[];
  /** Manila today; the calendar stops here. */
  today: string;
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  bucketIsExplicit: boolean;
  summary: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigateNow } = useDebouncedNavigation();
  const current = () => new URLSearchParams(searchParams.toString());

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-range">Period</Label>
            <DateRangePicker
              activePreset={preset === "custom" ? null : preset}
              id="analytics-range"
              maxDate={today}
              maxDays={MAX_ANALYTICS_DAYS}
              onSelect={(selection) =>
                navigateNow(
                  analyticsUrl(
                    current(),
                    selection.preset && isPreset(selection.preset.value)
                      ? { range: selection.preset.value as AnalyticsPreset }
                      : { custom: { from: selection.from, to: selection.to } },
                  ),
                )
              }
              presets={presets}
              value={{ from, to }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-bucket">Group by</Label>
            <Combobox
              className="min-w-44"
              id="analytics-bucket"
              onValueChange={(value) =>
                navigateNow(analyticsUrl(current(), { bucket: value as AnalyticsBucket | "auto" }))
              }
              options={BUCKET_OPTIONS.map((option) => ({
                value: option.value,
                label:
                  option.value === "auto" && !bucketIsExplicit
                    ? `Automatic (${bucket === "day" ? "daily" : `${bucket}ly`})`
                    : option.label,
              }))}
              value={bucketIsExplicit ? bucket : "auto"}
            />
          </div>
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
