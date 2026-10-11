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
import type { BookingTrendRow } from "@/features/analytics/lib/booking-analytics";

const config: ChartConfig = {
  booked: { label: "Booked", color: "var(--chart-1)" },
  cancelled: { label: "Cancelled", color: "var(--chart-4)" },
};

const countLabel = (value: number) => value.toLocaleString("en-PH");

/** Bookings made vs bookings cancelled per period, side by side on one count axis. */
export function BookingTrendChart({ rows, ariaLabel }: { rows: BookingTrendRow[]; ariaLabel: string }) {
  return (
    <ChartContainer
      aria-label={ariaLabel}
      className="aspect-auto h-64 w-full"
      config={config}
      role="img"
    >
      <BarChart accessibilityLayer barGap={2} data={rows} margin={{ left: 4, right: 12, top: 8 }}>
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
        <Bar dataKey="booked" fill="var(--color-booked)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
        <Bar
          dataKey="cancelled"
          fill="var(--color-cancelled)"
          isAnimationActive={false}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
