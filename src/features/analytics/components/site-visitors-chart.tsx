"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** One chart row. Plain numbers only — it crosses to a Client Component. */
export type SiteVisitorsRow = {
  label: string;
  bucketStart: string;
  facebook: number;
  other: number;
};

const config: ChartConfig = {
  facebook: { label: "From Facebook", color: "var(--chart-1)" },
  other: { label: "Everyone else", color: "var(--chart-4)" },
};

const countLabel = (value: number) => value.toLocaleString("en-PH");

/** Visitors per period, Facebook stacked under everyone else. */
export function SiteVisitorsChart({ rows, ariaLabel }: { rows: SiteVisitorsRow[]; ariaLabel: string }) {
  return (
    <ChartContainer aria-label={ariaLabel} className="aspect-auto h-64 w-full" config={config} role="img">
      <BarChart accessibilityLayer data={rows} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis axisLine={false} dataKey="label" minTickGap={16} tickLine={false} tickMargin={8} />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickFormatter={countLabel}
          tickLine={false}
          width={36}
        />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={countLabel} />}
          cursor={{ fill: "var(--muted)" }}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="facebook"
          fill="var(--color-facebook)"
          isAnimationActive={false}
          stackId="visitors"
          stroke="var(--card)"
          strokeWidth={1}
        />
        <Bar
          dataKey="other"
          fill="var(--color-other)"
          isAnimationActive={false}
          radius={[4, 4, 0, 0]}
          stackId="visitors"
          stroke="var(--card)"
          strokeWidth={1}
        />
      </BarChart>
    </ChartContainer>
  );
}
