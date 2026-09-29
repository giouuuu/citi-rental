"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANALYTICS_PRESETS, analyticsUrl } from "@/features/analytics/lib/analytics-window";
import type { AnalyticsBucket, AnalyticsPreset } from "@/features/analytics/types/analytics";
import { useDebouncedNavigation } from "@/features/shared/client";
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
  from,
  to,
  bucket,
  bucketIsExplicit,
  summary,
  children,
}: {
  preset: AnalyticsPreset;
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  bucketIsExplicit: boolean;
  summary: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigate, navigateNow } = useDebouncedNavigation();
  const current = () => new URLSearchParams(searchParams.toString());

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-range">Period</Label>
            <Select
              onValueChange={(value) =>
                navigateNow(analyticsUrl(current(), { range: value as AnalyticsPreset }))
              }
              value={preset}
            >
              <SelectTrigger className="min-w-44" id="analytics-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYTICS_PRESETS.map((option) => (
                  <SelectItem
                    disabled={option.value === "custom"}
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-from">From</Label>
            <Input
              // Remount when the window changes so a preset pick refreshes the value.
              defaultValue={from}
              id="analytics-from"
              key={`from-${from}`}
              max={to}
              onBlur={(event) => {
                if (event.target.value !== from) {
                  navigateNow(analyticsUrl(current(), { custom: { from: event.target.value, to } }));
                }
              }}
              onChange={(event) =>
                navigate(analyticsUrl(current(), { custom: { from: event.target.value, to } }))
              }
              type="date"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-to">To</Label>
            <Input
              defaultValue={to}
              id="analytics-to"
              key={`to-${to}`}
              min={from}
              onBlur={(event) => {
                if (event.target.value !== to) {
                  navigateNow(analyticsUrl(current(), { custom: { from, to: event.target.value } }));
                }
              }}
              onChange={(event) =>
                navigate(analyticsUrl(current(), { custom: { from, to: event.target.value } }))
              }
              type="date"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-bucket">Group by</Label>
            <Select
              onValueChange={(value) =>
                navigateNow(analyticsUrl(current(), { bucket: value as AnalyticsBucket | "auto" }))
              }
              value={bucketIsExplicit ? bucket : "auto"}
            >
              <SelectTrigger className="min-w-36" id="analytics-bucket">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value === "auto" && !bucketIsExplicit
                      ? `Automatic (${bucket === "day" ? "daily" : `${bucket}ly`})`
                      : option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
