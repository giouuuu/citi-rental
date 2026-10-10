import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  CalendarCheck2,
  CarFront,
  CircleDot,
  Clock,
  KeyRound,
  Mail,
  ReceiptText,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";

import {
  rentalTimelineTrigger,
  type RentalTimelineEvent,
  type RentalTimelineKind,
  type RentalTimelineTone,
} from "@/features/rentals/lib/rental-timeline";
import { formatManila } from "@/features/shared/lib/manila-time";
import { cn } from "@/lib/utils";

export const TIMELINE_ICONS: Record<RentalTimelineKind, LucideIcon> = {
  created: CalendarPlus,
  reserved: CalendarCheck2,
  pickup: KeyRound,
  return: CarFront,
  overdue: AlarmClock,
  rescheduled: CalendarClock,
  cancelled: XCircle,
  payment: Wallet,
  charge: ReceiptText,
  refund: Undo2,
  email: Mail,
  status: CircleDot,
  upcoming: Clock,
};

export const TIMELINE_TONES: Record<RentalTimelineTone, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-success/30 bg-success-surface text-success",
  warning: "border-warning/30 bg-warning-surface text-warning",
  danger: "border-destructive/30 bg-danger-surface text-destructive",
  muted: "border-dashed border-border bg-background text-muted-foreground",
};

/**
 * A vertical stepper: done steps on a solid rail, the latest one ringed as
 * where the rental is now, upcoming steps on a dashed rail.
 */
export function RentalTimelineList({
  events,
  highlightId,
}: {
  events: RentalTimelineEvent[];
  /** A step to mark and scroll to, e.g. the one tapped in the preview. */
  highlightId?: string;
}) {
  const firstUpcoming = events.findIndex((event) => event.upcoming);
  const current = firstUpcoming === -1 ? events.length - 1 : firstUpcoming - 1;

  return (
    <ol className="relative">
      {events.map((event, index) => {
        const Icon = TIMELINE_ICONS[event.kind];
        const last = index === events.length - 1;
        const highlighted = event.id === highlightId;
        return (
          <li
            key={event.id}
            aria-current={index === current ? "step" : undefined}
            className="relative flex gap-3 pb-6 last:pb-0"
          >
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-8 bottom-0 left-4 -translate-x-1/2",
                  events[index + 1]?.upcoming
                    ? "w-0 border-l border-dashed border-border"
                    : "w-px bg-border",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                TIMELINE_TONES[event.tone],
                index === current && "ring-3 ring-primary/25",
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <div
              ref={
                highlighted
                  ? (node) => node?.scrollIntoView({ block: "center" })
                  : undefined
              }
              className={cn(
                "min-w-0 flex-1 pt-1",
                highlighted && "-mt-1 rounded-md bg-muted px-2 pt-2 pb-1",
              )}
            >
              {index === firstUpcoming ? (
                <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Coming up
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    event.upcoming && "text-muted-foreground",
                  )}
                >
                  {event.title}
                </p>
                <time
                  className="text-xs tabular-nums text-muted-foreground"
                  dateTime={event.at}
                >
                  {formatManila(event.at, "stamp")}
                </time>
              </div>
              {event.detail ? (
                <p className="mt-0.5 text-sm break-words text-muted-foreground">
                  {event.detail}
                </p>
              ) : null}
              {event.upcoming ? null : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rentalTimelineTrigger(event)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
