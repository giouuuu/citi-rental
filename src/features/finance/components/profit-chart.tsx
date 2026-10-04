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
import { formatPhp, formatPhpCompact } from "@/features/shared/client";

const config: ChartConfig = {
  income: { label: "Income", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-4)" },
};

/**
 * Income beside expenses per month: the gap between the bars is the profit.
 * `showExpenses={false}` draws income alone, for viewers without the books.
 */
export function ProfitChart({
  rows,
  showExpenses = true,
}: {
  rows: { label: string; income: number; expenses: number }[];
  showExpenses?: boolean;
}) {
  return (
    <ChartContainer
      aria-label={showExpenses ? "Income and expenses by month" : "Income by month"}
      className="h-72 w-full"
      config={config}
    >
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={8} />
        <YAxis axisLine={false} tickFormatter={formatPhpCompact} tickLine={false} width={64} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={formatPhp} />} cursor={{ fill: "var(--muted)" }} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
        {showExpenses ? (
          <Bar dataKey="expenses" fill="var(--color-expenses)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
        ) : null}
      </BarChart>
    </ChartContainer>
  );
}
