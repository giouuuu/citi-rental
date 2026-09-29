import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { Delta } from "@/features/analytics/lib/analytics-metrics";
import { cn } from "@/lib/utils";

/**
 * One headline number. The delta says which way it moved *and* whether that
 * is good — more cancellations is "up" but bad — with an arrow and words, so
 * the meaning never rides on color alone.
 */
export function KpiTile({
  label,
  value,
  note,
  delta,
  goodWhen = "up",
  deltaSuffix = "%",
}: {
  label: string;
  value: string;
  note?: string;
  delta?: Delta | null;
  goodWhen?: "up" | "down";
  /** "%" for relative change, " pts" for a change in a percentage. */
  deltaSuffix?: string;
}) {
  const Icon =
    delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  const good = delta && delta.direction !== "flat" && delta.direction === goodWhen;
  const bad = delta && delta.direction !== "flat" && delta.direction !== goodWhen;

  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl leading-none font-bold tracking-tight tabular-nums">{value}</p>
        {delta ? (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              good && "text-success",
              bad && "text-destructive",
              !good && !bad && "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {delta.direction === "flat"
              ? "No change"
              : delta.percent === null
                ? delta.direction === "up"
                  ? "Up from zero"
                  : "Down"
                : `${delta.percent > 0 ? "+" : ""}${delta.percent}${deltaSuffix}`}
            <span className="font-normal text-muted-foreground">vs previous period</span>
          </p>
        ) : null}
        {note ? <p className="text-xs leading-5 text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
