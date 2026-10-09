"use client";

import Image from "next/image";
import { useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";

import type { PublicReview } from "@/features/reviews/types/public-review";
import { cn } from "@/lib/utils";

export type LightboxPhoto = { review: PublicReview; layoutId: string };

/** Shared by the tile and the enlarged photo so the morph feels like one object. */
export const PHOTO_MORPH = { type: "spring", duration: 0.5, bounce: 0.12 } as const;
/** The tile's own `sizes`: reusing it here hits the cached image instantly. */
export const PHOTO_TILE_SIZES = "(min-width: 640px) 240px, 192px";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function photoCaption(review: PublicReview) {
  return [review.reviewer_name, review.vehicle_label].filter(Boolean).join(" · ");
}

export function photoAlt(review: PublicReview) {
  if (review.reviewer_name) return `${review.reviewer_name} with their rental`;
  if (review.vehicle_label) return `A Zeke renter with their ${review.vehicle_label}`;
  return "A Zeke renter with their car";
}

/**
 * A renter photo enlarged from its marquee tile. The photo shares the tile's
 * `layoutId`, so Motion morphs it out of the tile and back into it on close.
 * Radix keeps focus, Escape and scroll lock; `forceMount` hands the exit to
 * AnimatePresence, whose `onExitComplete` tells the wall the photo is home.
 */
export function ReviewPhotoLightbox({
  photo,
  onClose,
  onExitComplete,
}: {
  photo: LightboxPhoto | null;
  onClose: () => void;
  onExitComplete: () => void;
}) {
  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={photo !== null}
    >
      <AnimatePresence onExitComplete={onExitComplete}>
        {photo ? <LightboxBody key={photo.layoutId} onClose={onClose} photo={photo} /> : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

function LightboxBody({ photo, onClose }: { photo: LightboxPhoto; onClose: () => void }) {
  const [sharpLoaded, setSharpLoaded] = useState(false);
  const caption = photoCaption(photo.review);
  const src = photo.review.photo_url!;

  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay asChild forceMount>
        <motion.div
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
          className="fixed inset-0 z-50 bg-brand-950/85 backdrop-blur-sm"
          exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
          initial={{ opacity: 0 }}
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-4 p-4 outline-none sm:p-8"
        forceMount
        // Anywhere closes it, the photo included, like any photo viewer.
        onClick={onClose}
      >
        <DialogPrimitive.Title className="sr-only">{caption || "Customer photo"}</DialogPrimitive.Title>
        <motion.div
          className="relative aspect-3/4 w-[min(92vw,calc((100dvh-9rem)*0.75))] overflow-hidden bg-brand-900 shadow-2xl"
          layoutId={photo.layoutId}
          style={{ borderRadius: 16 }}
          transition={PHOTO_MORPH}
        >
          {/* Already cached from the tile, so the morph never shows a blank box. */}
          <Image alt="" className="object-cover" fill sizes={PHOTO_TILE_SIZES} src={src} />
          <Image
            alt={photoAlt(photo.review)}
            className={cn(
              "object-cover transition-opacity duration-200 ease-out",
              sharpLoaded ? "opacity-100" : "opacity-0",
            )}
            fill
            onLoad={() => setSharpLoaded(true)}
            priority
            sizes="(min-width: 640px) 640px, 92vw"
            src={src}
          />
        </motion.div>
        {caption ? (
          <motion.p
            animate={{
              opacity: 1,
              transform: "translateY(0px)",
              transition: { delay: 0.15, duration: 0.25, ease: EASE_OUT },
            }}
            className="text-sm font-medium text-white"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
          >
            {caption}
          </motion.p>
        ) : null}
        <DialogPrimitive.Close asChild>
          <motion.button
            animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.2 } }}
            className="fixed top-4 right-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0 }}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close photo</span>
          </motion.button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
