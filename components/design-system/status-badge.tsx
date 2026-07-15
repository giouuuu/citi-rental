import {
  CalendarClock,
  CheckCircle2,
  CircleParking,
  Clock3,
  KeyRound,
  Navigation,
  PauseCircle,
  Radio,
  SignalZero,
  TriangleAlert,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "online"
  | "moving"
  | "parked"
  | "delayed"
  | "offline"
  | "critical"
  | "available"
  | "reserved"
  | "rented"
  | "maintenance"
  | "inactive"
  | "active"
  | "completed"
  | "cancelled"
  | "overdue"
  | "draft";

const statusStyles: Record<StatusTone, string> = {
  online: "bg-teal-50 text-teal-700 ring-teal-600/15",
  moving: "bg-teal-50 text-teal-700 ring-teal-600/15",
  parked: "bg-brand-50 text-brand-700 ring-brand-500/15",
  delayed: "bg-warning-surface text-warning ring-warning/15",
  offline: "bg-offline-surface text-offline ring-offline/15",
  critical: "bg-danger-surface text-destructive ring-destructive/15",
  available: "bg-teal-50 text-teal-700 ring-teal-600/15",
  reserved: "bg-info-surface text-info ring-info/15",
  rented: "bg-gold-50 text-gold-700 ring-gold-600/20",
  maintenance: "bg-warning-surface text-warning ring-warning/15",
  inactive: "bg-offline-surface text-offline ring-offline/15",
  active: "bg-teal-50 text-teal-700 ring-teal-600/15",
  completed: "bg-success-surface text-success ring-success/15",
  cancelled: "bg-offline-surface text-offline ring-offline/15",
  overdue: "bg-danger-surface text-destructive ring-destructive/15",
  draft: "bg-offline-surface text-offline ring-offline/15",
};

const statusIcons: Record<StatusTone, LucideIcon> = {
  online: Radio,
  moving: Navigation,
  parked: CircleParking,
  delayed: Clock3,
  offline: SignalZero,
  critical: TriangleAlert,
  available: CheckCircle2,
  reserved: CalendarClock,
  rented: KeyRound,
  maintenance: Wrench,
  inactive: PauseCircle,
  active: Navigation,
  completed: CheckCircle2,
  cancelled: XCircle,
  overdue: TriangleAlert,
  draft: Clock3,
};

type StatusBadgeProps = {
  status: StatusTone | string;
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const Icon = statusIcons[status as StatusTone] ?? Clock3;

  return (
    <Badge
      className={cn(
        "h-6 gap-1.5 border-0 px-2.5 font-medium capitalize shadow-none ring-1 ring-inset",
        statusStyles[status as StatusTone] ??
          "bg-muted text-muted-foreground ring-border",
        className,
      )}
      variant="outline"
    >
      <Icon aria-hidden="true" className="size-3" />
      {label ?? status.replaceAll("_", " ")}
    </Badge>
  );
}
