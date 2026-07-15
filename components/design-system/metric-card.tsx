import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: "teal" | "brand" | "gold" | "danger";
};

const tones = {
  teal: "bg-teal-50 text-teal-700",
  brand: "bg-brand-50 text-brand-700",
  gold: "bg-gold-50 text-gold-700",
  danger: "bg-danger-surface text-destructive",
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "brand",
}: MetricCardProps) {
  return (
    <Card className="transition-[border-color,box-shadow] duration-150 hover:border-brand-100 hover:shadow-sm">
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl leading-none font-bold tracking-[-0.03em] tabular-nums">
            {value}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p>
        </div>
        <div className={cn("flex size-10 items-center justify-center rounded-md", tones[tone])}>
          <Icon aria-hidden="true" className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
