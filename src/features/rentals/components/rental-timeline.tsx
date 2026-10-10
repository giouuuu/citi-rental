import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  CalendarCheck2,
  CarFront,
  CircleDot,
  Clock,
  History,
  KeyRound,
  Mail,
  ReceiptText,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type {
  RentalTimelineEvent,
  RentalTimelineKind,
  RentalTimelineTone,
} from "@/features/rentals/lib/rental-timeline";
import { getRentalTimeline } from "@/features/rentals/services/get-rental-timeline";
import { formatManila } from "@/features/shared/lib/manila-time";
import { cn } from "@/lib/utils";

const ICONS: Record<RentalTimelineKind, LucideIcon> = {
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

const TONES: Record<RentalTimelineTone, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-success/30 bg-success-surface text-success",
  warning: "border-warning/30 bg-warning-surface text-warning",
  danger: "border-destructive/30 bg-danger-surface text-destructive",
  muted: "border-dashed border-border bg-background text-muted-foreground",
};

export async function RentalTimeline({ rentalId }: { rentalId: string }) {
  const events = await getRentalTimeline(rentalId);
  return <RentalTimelineList events={events} />;
}

export function RentalTimelineList({
  events,
}: {
  events: RentalTimelineEvent[];
}) {
  if (events.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>
            Bookings, payments, pickups and returns show up here as they
            happen.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const firstUpcoming = events.findIndex((event) => event.upcoming);

  return (
    <ol className="relative">
      {events.map((event, index) => {
        const Icon = ICONS[event.kind];
        const last = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0">
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
                TONES[event.tone],
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
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
              {event.actor ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  by {event.actor}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
