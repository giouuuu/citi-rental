"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";

import {
  QuickBookPanel,
  type QuickBookTrip,
} from "@/components/landing/quick-book-panel";
import { Button } from "@/components/ui/button";
import { trackSiteEvent } from "@/features/site-analytics/lib/track-site-event";
import type {
  PublicListedVehicle,
  PublicVehiclePhoto,
} from "@/features/vehicles/types/public-fleet-vehicle";
import { cn } from "@/lib/utils";

/** Shared by the card photo and the gallery stage so the morph reads as one object. */
export const GALLERY_MORPH = { type: "spring", duration: 0.5, bounce: 0.12 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Horizontal drag, in px, that counts as a swipe on the photo stage. */
const SWIPE_THRESHOLD = 40;

/** Round white controls floating over the photo stage. */
export const FLOATING_BUTTON =
  "rounded-full bg-white/85 text-brand-950 shadow-[0_8px_24px_-8px_rgb(7_17_31/0.5)] backdrop-blur-md transition-[transform,background-color] duration-200 ease-out hover:bg-white active:scale-95";

type VehicleGalleryDialogProps = {
  vehicle: PublicListedVehicle;
  /** The visitor's search so far; the quick-book panel starts from it. */
  trip: QuickBookTrip;
  /** Signed-in customers skip the sign-in step. */
  signedIn?: boolean;
  /** Flat fee to hold a booking, from Settings. */
  reservationFee?: number | null;
  /** Settings → driver day rate, for the with-driver quote. */
  driverDailyRate?: number | null;
  /**
   * The opener's photo frame `layoutId`. When set, the stage morphs out of
   * that frame and back into it on close; otherwise it fades and scales in.
   */
  layoutId?: string;
  /**
   * The opener's own photo, `src` and `sizes` exactly as it renders them. It is
   * already cached, so it fills the stage during the morph until the first
   * angle loads.
   */
  cover?: { src: string; sizes: string };
  onOpenChange?: (open: boolean) => void;
  /** Fires once the close animation has finished and the photo is home. */
  onExitComplete?: () => void;
  /**
   * The button that opens the gallery (the card photo, the hero car). With
   * `layoutId`, pass a tree holding a `VehicleGalleryTrigger` instead: the
   * stage must render outside the frame it morphs from, never inside it.
   */
  children: ReactNode;
};

/** Opens the enclosing `VehicleGalleryDialog` from anywhere in its children. */
export const VehicleGalleryTrigger = DialogPrimitive.Trigger;

/**
 * Lightbox over a car's gallery angles. Every photo stays mounted and stacked,
 * so stepping between them is a crossfade with a short slide in the direction
 * of travel, and the next angle is already loaded. Radix keeps focus, Escape
 * and scroll lock; `forceMount` hands the exit to AnimatePresence.
 */
export function VehicleGalleryDialog({
  vehicle,
  trip,
  signedIn,
  reservationFee,
  driverDailyRate,
  layoutId,
  cover,
  onOpenChange,
  onExitComplete,
  children,
}: VehicleGalleryDialogProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  function handleOpenChange(next: boolean) {
    // Every visit starts on the cover angle, like the card shows.
    if (next) {
      setIndex(0);
      trackSiteEvent("vehicle_view", { vehicleId: vehicle.id });
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <DialogPrimitive.Root onOpenChange={handleOpenChange} open={open}>
      {layoutId ? children : <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>}
      <MotionConfig reducedMotion="user">
        <AnimatePresence onExitComplete={onExitComplete}>
          {open ? (
            <GalleryBody
              cover={cover}
              driverDailyRate={driverDailyRate}
              index={index}
              key="gallery"
              layoutId={layoutId}
              onClose={() => handleOpenChange(false)}
              reservationFee={reservationFee}
              setIndex={setIndex}
              signedIn={signedIn}
              trip={trip}
              vehicle={vehicle}
            />
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </DialogPrimitive.Root>
  );
}

function GalleryBody({
  vehicle,
  trip,
  signedIn,
  reservationFee,
  driverDailyRate,
  layoutId,
  cover,
  index,
  setIndex,
  onClose,
}: Omit<VehicleGalleryDialogProps, "children" | "onOpenChange" | "onExitComplete"> & {
  index: number;
  setIndex: (update: (value: number) => number) => void;
  onClose: () => void;
}) {
  const photos = vehicle.gallery;
  const count = photos.length;
  const current = photos[index];
  const swipeStart = useRef<number | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(false);

  function step(delta: number) {
    setIndex((value) => (value + delta + count) % count);
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Arrows page photos only from the gallery itself: the booking panel's
    // fields, toggle and calendars use them too (and their popovers bubble
    // here through the portal).
    const target = event.target as HTMLElement;
    if (
      target !== event.currentTarget &&
      !target.closest?.("[data-gallery-keys]")
    ) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay asChild forceMount>
        <motion.div
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
          className="fixed inset-0 z-50 bg-brand-950/70 backdrop-blur-sm"
          exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
          initial={{ opacity: 0 }}
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-6"
        forceMount
        // The content box covers the viewport, so outside clicks land here.
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={handleKeyDown}
        // Focus the dialog itself rather than ringing the close button on a
        // mouse open; Tab still reaches every control and arrows still work.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        {/*
          Phones: photo, then the booking panel, scrolling inside the sheet.
          md+: photo column beside a fixed panel; the width bows to viewport
          height so the photo and its thumbnails always fit.
        */}
        <div className="relative w-[min(36rem,100%)] p-2 md:w-[min(70rem,100%,calc((100dvh-12rem)*1.6+22rem))]">
          {/*
            The modal's white card is a layer behind the photo, not its parent:
            fading a parent would fade the photo mid-morph too.
          */}
          <motion.div
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-popover shadow-[0_32px_64px_-24px_rgb(7_17_31/0.6)] ring-1 ring-foreground/10"
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } }}
            initial={{ opacity: 0, scale: 0.97 }}
          />
          <div className="relative grid max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain md:max-h-none md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-5 md:overflow-visible">
          <div className="min-w-0" data-gallery-keys="">
          <motion.div
            animate={layoutId ? undefined : { opacity: 1, scale: 1 }}
            className="relative aspect-[16/10] touch-pan-y overflow-hidden bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)] select-none"
            exit={layoutId ? undefined : { opacity: 0, scale: 0.97 }}
            initial={layoutId ? undefined : { opacity: 0, scale: 0.96 }}
            layoutId={layoutId}
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
            // Same inset and radius as the card's photo frame.
            style={{ borderRadius: 12 }}
            transition={GALLERY_MORPH}
          >
            {cover ? (
              <Image
                alt=""
                aria-hidden="true"
                className={cn(
                  "object-cover transition-opacity duration-200 ease-out",
                  firstLoaded || index !== 0 ? "opacity-0" : "opacity-100",
                )}
                fill
                sizes={cover.sizes}
                src={cover.src}
              />
            ) : null}
            <GalleryPhotoStack
              index={index}
              onFirstLoad={() => setFirstLoaded(true)}
              photos={photos}
              vehicleName={vehicle.name}
            />

            {/* Controls wait for the morph, so they never shrink or stretch with it. */}
            <motion.div
              animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.2, ease: EASE_OUT } }}
              className="absolute inset-0"
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              initial={{ opacity: 0 }}
            >
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

              <DialogPrimitive.Close asChild>
                <Button
                  aria-label="Close gallery"
                  className={cn(FLOATING_BUTTON, "absolute top-3 right-3 size-9")}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-4.5" />
                </Button>
              </DialogPrimitive.Close>

              {count > 1 ? (
                <>
                  <GalleryArrow direction="previous" onClick={() => step(-1)} />
                  <GalleryArrow direction="next" onClick={() => step(1)} />
                </>
              ) : null}
            </motion.div>
          </motion.div>

          {/* Thumbnails and booking fade in under the photo once it has landed. */}
          <motion.div
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.12, duration: 0.3, ease: EASE_OUT },
            }}
            className="relative text-popover-foreground"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0, y: -8 }}
          >
            {count > 1 ? (
              <GalleryThumbnails
                className="border-b border-border px-2 pt-3 pb-3"
                index={index}
                onSelect={(photoIndex) => setIndex(() => photoIndex)}
                photos={photos}
              />
            ) : null}
          </motion.div>
          </div>

          {/* The booking panel: beside the photo on md+, under it on phones. */}
          <motion.div
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.18, duration: 0.32, ease: EASE_OUT },
            }}
            className="relative px-2 pt-4 pb-2 text-popover-foreground md:py-3 md:pr-2 md:pl-0"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0, y: 8 }}
          >
            <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-[-0.015em] text-brand-950">
              {vehicle.name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
              {[vehicle.category?.trim(), vehicle.year ? `${vehicle.year} model` : null]
                .filter(Boolean)
                .join(" · ") || "Choose your trip and book online."}
            </DialogPrimitive.Description>
            <div className="mt-4">
              <QuickBookPanel
                driverDailyRate={driverDailyRate}
                onBook={onClose}
                reservationFee={reservationFee}
                signedIn={signedIn}
                trip={trip}
                vehicle={vehicle}
              />
            </div>
          </motion.div>
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function GalleryArrow({
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

/**
 * Every angle stays mounted and stacked, so stepping between them is a
 * crossfade with a short slide in the direction of travel, and the next angle
 * is already loaded. Fills its positioned parent.
 */
export function GalleryPhotoStack({
  photos,
  index,
  vehicleName,
  sizes = "(min-width: 768px) 768px, 100vw",
  onFirstLoad,
}: {
  photos: PublicVehiclePhoto[];
  index: number;
  vehicleName: string;
  sizes?: string;
  onFirstLoad?: () => void;
}) {
  return photos.map((photo, photoIndex) => {
    const offset = photoIndex - index;
    return (
      <Image
        alt={`${vehicleName}, ${photo.label}`}
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
        onLoad={photoIndex === 0 ? onFirstLoad : undefined}
        priority={photoIndex === 0}
        sizes={sizes}
        src={photo.url}
      />
    );
  });
}

/** One button per angle; the current one is ringed and labelled. */
export function GalleryThumbnails({
  photos,
  index,
  onSelect,
  className,
}: {
  photos: PublicVehiclePhoto[];
  index: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <ul
      aria-label="Photos"
      className={cn(
        "grid grid-cols-6 gap-2 sm:flex sm:justify-center sm:gap-3",
        className,
      )}
    >
      {photos.map((photo, photoIndex) => {
        const active = photoIndex === index;
        return (
          <li className="sm:w-20" key={photo.kind}>
            <button
              aria-current={active ? "true" : undefined}
              aria-label={`Show ${photo.label}`}
              className={cn(
                "group/thumb relative block aspect-[4/3] w-full overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-popover transition-[box-shadow,opacity] duration-200 ease-out focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "opacity-100 ring-teal-500"
                  : "opacity-55 ring-transparent hover:opacity-90",
              )}
              onClick={() => onSelect(photoIndex)}
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
  );
}
