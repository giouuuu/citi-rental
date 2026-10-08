"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ANALYTICS_TABS,
  analyticsUrl,
  isPreset,
  MAX_ANALYTICS_DAYS,
  resolveAnalyticsTab,
  tabUsesBucket,
} from "@/features/analytics/lib/analytics-window";
import type {
  AnalyticsBucket,
  AnalyticsPreset,
  AnalyticsTab,
} from "@/features/analytics/types/analytics";
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
 * Tabs, filter bar, and the panels they drive. Filters and tabs auto-apply
 * through `useDebouncedNavigation`; while the server renders the new tab or
 * period, the previous panels stay on screen dimmed and the reserved 2px bar
 * shows progress. Only the active tab's panels are rendered (`children`), so
 * each tab fetches just its own data.
 */
export function AnalyticsFrame({
  tab,
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
  /** The tab the server rendered. */
  tab: AnalyticsTab;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigateNow } = useDebouncedNavigation();
  const current = () => new URLSearchParams(searchParams.toString());
  // The clicked tab lights up at once; the server's tab wins when it lands
  // (and on back/forward).
  const [selected, setSelected] = useState(tab);
  const [renderedTab, setRenderedTab] = useState(tab);
  if (tab !== renderedTab) {
    setRenderedTab(tab);
    setSelected(tab);
  }

  function selectTab(value: string) {
    const next = resolveAnalyticsTab(value);
    if (next === selected) return;
    setSelected(next);
    navigateNow(analyticsUrl(current(), { tab: next }));
  }

  return (
    <Tabs className="gap-6" onValueChange={selectTab} value={selected}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList aria-label="Analytics sections" className="w-max" variant="line">
          {ANALYTICS_TABS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
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
          {tabUsesBucket(selected) ? (
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
          ) : null}
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {summary}
        </p>
        <DataTableLoadingBar pending={isPending} />
      </div>
      <TabsContent
        aria-busy={isPending}
        className={cn(
          "space-y-8 outline-none transition-opacity",
          isPending && "pointer-events-none opacity-60",
        )}
        value={selected}
      >
        {children}
      </TabsContent>
    </Tabs>
  );
}
