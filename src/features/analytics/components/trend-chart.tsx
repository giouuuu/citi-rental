"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendRow } from "@/features/analytics/lib/trend-series";
import { formatPhp, formatPhpCompact } from "@/features/shared/client";

export type TrendChartVariant = "collected" | "bookings" | "utilization";

const configs: Record<TrendChartVariant, ChartConfig> = {
  collected: { collected: { label: "Collected", color: "var(--chart-1)" } },
  bookings: {
    website: { label: "Website", color: "var(--chart-1)" },
    frontDesk: { label: "Front desk", color: "var(--chart-4)" },
  },
  utilization: { utilization: { label: "Utilization", color: "var(--chart-1)" } },
};

const percentLabel = (value: number) => `${value}%`;
const countLabel = (value: number) => value.toLocaleString("en-PH");

/**
 * Time-series chart for the analytics panels. One y-axis per chart; two
 * series at most (the validated teal/blue pair), with a legend whenever there
 * are two. Animations are off so filter changes and reduced-motion users see
 * the data land immediately.
 */
export function TrendChart({
  rows,
  variant,
  ariaLabel,
}: {
  rows: TrendRow[];
  variant: TrendChartVariant;
  ariaLabel: string;
}) {
  const config = configs[variant];
  const axis = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        axisLine={false}
        dataKey="label"
        minTickGap={16}
        tickLine={false}
        tickMargin={8}
      />
      <YAxis
        allowDecimals={false}
        axisLine={false}
        domain={variant === "utilization" ? [0, 100] : undefined}
        tickFormatter={
          variant === "collected"
            ? formatPhpCompact
            : variant === "utilization"
              ? percentLabel
              : countLabel
        }
        tickLine={false}
        width={variant === "collected" ? 56 : 36}
      />
    </>
  );

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className="aspect-auto h-64 w-full"
      config={config}
      role="img"
    >
      {variant === "utilization" ? (
        <LineChart accessibilityLayer data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          {axis}
          <ChartTooltip
            content={<ChartTooltipContent indicator="line" valueFormatter={percentLabel} />}
            cursor={false}
          />
          <Line
            activeDot={{ r: 4 }}
            connectNulls
            dataKey="utilization"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-utilization)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      ) : (
        <BarChart accessibilityLayer data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          {axis}
          <ChartTooltip
            content={
              <ChartTooltipContent
                valueFormatter={variant === "collected" ? formatPhp : countLabel}
              />
            }
            cursor={{ fill: "var(--muted)" }}
          />
          {variant === "collected" ? (
            <Bar
              dataKey="collected"
              fill="var(--color-collected)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
            />
          ) : (
            <>
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="website"
                fill="var(--color-website)"
                isAnimationActive={false}
                stackId="source"
                stroke="var(--card)"
                strokeWidth={1}
              />
              <Bar
                dataKey="frontDesk"
                fill="var(--color-frontDesk)"
                isAnimationActive={false}
                radius={[4, 4, 0, 0]}
                stackId="source"
                stroke="var(--card)"
                strokeWidth={1}
              />
            </>
          )}
        </BarChart>
      )}
    </ChartContainer>
  );
}
