"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trackSiteEvent } from "@/features/site-analytics/lib/track-site-event";
import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import { cn } from "@/lib/utils";

/** Horizontal drag, in px, that counts as a swipe on the photo stage. */
const SWIPE_THRESHOLD = 40;

/** Round white controls floating over the photo stage. */
const FLOATING_BUTTON =
  "rounded-full bg-white/85 text-brand-950 shadow-[0_8px_24px_-8px_rgb(7_17_31/0.5)] backdrop-blur-md transition-[transform,background-color] duration-200 ease-out hover:bg-white active:scale-95";

type VehicleGalleryDialogProps = {
  vehicle: PublicListedVehicle;
  bookHref: string;
  trip: { start?: string; end?: string };
  /** Flat fee to hold a booking, from Settings. */
  reservationFee?: number | null;
  /** The button that opens the gallery (the card photo, the hero car). */
  children: ReactElement;
};

/**
 * Lightbox over a car's gallery angles. Every photo stays mounted and stacked,
 * so stepping between them is a crossfade with a short slide in the direction
 * of travel — and the next angle is already loaded.
 */
export function VehicleGalleryDialog({
  vehicle,
  bookHref,
  trip,
  reservationFee,
  children,
}: VehicleGalleryDialogProps) {
  const photos = vehicle.gallery;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const count = photos.length;
  const current = photos[index];

  function step(delta: number) {
    setIndex((value) => (value + delta + count) % count);
  }

  function handleOpenChange(next: boolean) {
    // Every visit starts on the cover angle, like the card shows.
    if (next) {
      setIndex(0);
      trackSiteEvent("vehicle_view", { vehicleId: vehicle.id });
    }
    setOpen(next);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent
        className="gap-0 overflow-hidden rounded-2xl p-0 duration-200 sm:max-w-4xl"
        onKeyDown={handleKeyDown}
        showCloseButton={false}
      >
        <div
          className="relative aspect-[4/3] touch-pan-y overflow-hidden bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)] select-none sm:aspect-auto sm:h-[min(60svh,540px)]"
          onPointerCancel={() => {
            swipeStart.current = null;
          }}
          onPointerDown={(event) => {
            swipeStart.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (swipeStart.current === null) return;
            const delta = event.clientX - swipeStart.current;
            swipeStart.current = null;
            if (Math.abs(delta) >= SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
          }}
        >
          {photos.map((photo, photoIndex) => {
            const offset = photoIndex - index;
            return (
              <Image
                alt={`${vehicle.name} — ${photo.label}`}
                aria-hidden={offset !== 0}
                className={cn(
                  "object-contain transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                  offset === 0
                    ? "translate-x-0 scale-100 opacity-100"
                    : offset < 0
                      ? "-translate-x-[6%] scale-[1.02] opacity-0"
                      : "translate-x-[6%] scale-[1.02] opacity-0",
                )}
                draggable={false}
                fill
                key={photo.kind}
                priority={photoIndex === 0}
                sizes="(min-width: 640px) 896px, 100vw"
                src={photo.url}
              />
            );
          })}

          <p
            aria-live="polite"
            className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-brand-950/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
          >
            <span
              className="animate-in duration-300 fade-in-0 slide-in-from-bottom-1"
              key={current?.kind}
            >
              {current?.label}
            </span>
            <span className="text-white/60 tabular-nums">
              {index + 1} / {count}
            </span>
          </p>

          <DialogClose asChild>
            <Button
              aria-label="Close gallery"
              className={cn(FLOATING_BUTTON, "absolute top-3 right-3 size-9")}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4.5" />
            </Button>
          </DialogClose>

          {count > 1 ? (
            <>
              <GalleryArrow direction="previous" onClick={() => step(-1)} />
              <GalleryArrow direction="next" onClick={() => step(1)} />
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <ul
            aria-label="Photos"
            className="grid grid-cols-6 gap-2 border-y border-border px-4 py-3 sm:flex sm:justify-center sm:gap-3 sm:px-5"
          >
            {photos.map((photo, photoIndex) => {
              const active = photoIndex === index;
              return (
                <li className="sm:w-24" key={photo.kind}>
                  <button
                    aria-current={active ? "true" : undefined}
                    aria-label={`Show ${photo.label}`}
                    className={cn(
                      "group/thumb relative block aspect-[4/3] w-full overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-popover transition-[box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-ring",
                      active
                        ? "opacity-100 ring-teal-500"
                        : "opacity-55 ring-transparent hover:opacity-90",
                    )}
                    onClick={() => setIndex(photoIndex)}
                    type="button"
                  >
                    <Image
                      alt=""
                      className="object-cover transition-transform duration-300 ease-out group-hover/thumb:scale-105"
                      fill
                      sizes="120px"
                      src={photo.url}
                    />
                  </button>
                  <span
                    className={cn(
                      "mt-1.5 hidden truncate text-center text-[11px] transition-colors duration-200 sm:block",
                      active ? "font-medium text-brand-950" : "text-muted-foreground",
                    )}
                  >
                    {photo.label}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg font-semibold tracking-[-0.015em] text-brand-950">
              {vehicle.name}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {vehicle.make} {vehicle.model} · {vehicle.year}
            </DialogDescription>
            <VehicleRateQuote
              className="mt-2"
              end={trip.end}
              rates={{
                daily: vehicle.daily_rate,
                halfDay: vehicle.half_day_rate,
                hourly: vehicle.hourly_rate,
              }}
              reservationFee={reservationFee}
              start={trip.start}
            />
          </div>
          <Button asChild className="shrink-0 sm:min-w-40" size="lg">
            {/* Close first: the booking step opens as its own modal. */}
            <Link href={bookHref} onClick={() => setOpen(false)}>
              Book this car
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GalleryArrow({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "next" ? ChevronRight : ChevronLeft;
  return (
    <Button
      aria-label={direction === "next" ? "Next photo" : "Previous photo"}
      className={cn(
        FLOATING_BUTTON,
        "absolute top-1/2 size-10 -translate-y-1/2",
        direction === "next" ? "right-3" : "left-3",
      )}
      onClick={onClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
