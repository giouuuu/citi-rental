"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BreakdownItem } from "@/features/analytics/lib/booking-analytics";

const config: ChartConfig = { value: { label: "Bookings", color: "var(--chart-1)" } };

const ROW_HEIGHT = 34;

/**
 * Horizontal bars for one categorical breakdown (reasons, timing, status).
 * A single series, so the card title names it and there is no legend; each
 * bar carries its count at the tip. Categories keep the order given — ranked
 * lists arrive sorted, ordinal ones (timing buckets) arrive in their order.
 */
export function BreakdownChart({
  items,
  ariaLabel,
  seriesLabel = "Bookings",
}: {
  items: BreakdownItem[];
  ariaLabel: string;
  seriesLabel?: string;
}) {
  const labelWidth = Math.min(
    180,
    Math.max(72, ...items.map((item) => item.label.length * 6.6 + 8)),
  );

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className="aspect-auto w-full"
      config={{ value: { ...config.value, label: seriesLabel } }}
      role="img"
      style={{ height: items.length * ROW_HEIGHT + 16 }}
    >
      <BarChart
        accessibilityLayer
        barCategoryGap={8}
        data={items}
        layout="vertical"
        margin={{ left: 0, right: 36, top: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis allowDecimals={false} dataKey="value" hide type="number" />
        <YAxis
          axisLine={false}
          dataKey="label"
          interval={0}
          tickLine={false}
          tickMargin={8}
          type="category"
          width={labelWidth}
        />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={(value) => value.toLocaleString("en-PH")} />}
          cursor={{ fill: "var(--muted)" }}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          isAnimationActive={false}
          minPointSize={2}
          radius={[0, 4, 4, 0]}
        >
          <LabelList
            className="fill-foreground tabular-nums"
            dataKey="value"
            fontSize={12}
            offset={6}
            position="right"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
