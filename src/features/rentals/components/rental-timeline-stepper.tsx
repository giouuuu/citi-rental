"use client";

import { useState } from "react";
import { ChevronRight, Clock, UserRound } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RentalTimelineList,
  TIMELINE_ICONS,
  TIMELINE_TONES,
} from "@/features/rentals/components/rental-timeline-list";
import {
  previewRentalTimeline,
  rentalTimelineTrigger,
  type RentalTimelineEvent,
} from "@/features/rentals/lib/rental-timeline";
import { formatManila } from "@/features/shared/lib/manila-time";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const TITLE = "Rental timeline";

function eventCount(count: number) {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

/**
 * The latest steps as a horizontal stepper. Hovering a step shows when it
 * happened and who triggered it; tapping one opens the whole history on that
 * step — a dialog on desktop, a bottom sheet on mobile.
 */
export function RentalTimelineStepper({
  events,
}: {
  events: RentalTimelineEvent[];
}) {
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | undefined>();
  const isMobile = useIsMobile();
  const steps = previewRentalTimeline(events);
  const firstUpcoming = steps.findIndex((event) => event.upcoming);
  const current = firstUpcoming === -1 ? steps.length - 1 : firstUpcoming - 1;
  const description = `${eventCount(events.length)}, oldest first`;

  function show(id?: string) {
    setFocusId(id);
    setOpen(true);
  }

  const history = <RentalTimelineList events={events} highlightId={focusId} />;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Timeline</h2>
        <button
          type="button"
          onClick={() => show()}
          className="-my-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          View all {eventCount(events.length)}
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
      </div>

      <ol className="grid auto-cols-fr grid-flow-col">
        {steps.map((event, index) => {
          const Icon = TIMELINE_ICONS[event.kind];
          const next = steps[index + 1];
          return (
            <li
              key={event.id}
              aria-current={index === current ? "step" : undefined}
              className="relative"
            >
              {next ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-4 right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] -translate-y-1/2",
                    next.upcoming
                      ? "border-t border-dashed border-border"
                      : "h-0.5 rounded-full bg-primary/30",
                  )}
                />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => show(event.id)}
                    className="group flex w-full flex-col items-center gap-2 rounded-md px-1 pb-1 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span
                      className={cn(
                        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        TIMELINE_TONES[event.tone],
                        index === current && "ring-3 ring-primary/25",
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "line-clamp-2 text-xs font-medium sm:text-sm",
                          event.upcoming && "text-muted-foreground",
                        )}
                      >
                        {event.upcoming ? `Next: ${event.title}` : event.title}
                      </span>
                      <time
                        className="text-[11px] text-muted-foreground tabular-nums sm:text-xs"
                        dateTime={event.at}
                      >
                        {formatManila(event.at, "dateTime")}
                      </time>
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  className="max-w-64"
                  side="bottom"
                  sideOffset={6}
                >
                  <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
                    <p className="font-medium text-pretty">{event.title}</p>
                    <p className="flex items-center gap-1.5 tabular-nums opacity-80">
                      <Clock aria-hidden className="size-3 shrink-0" />
                      {formatManila(event.at, "stamp")}
                    </p>
                    <p className="flex items-start gap-1.5 opacity-80">
                      <UserRound
                        aria-hidden
                        className="mt-px size-3 shrink-0"
                      />
                      {rentalTimelineTrigger(event)}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{TITLE}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{history}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{TITLE}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="-mx-4 overflow-y-auto px-4 pb-1">{history}</div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
