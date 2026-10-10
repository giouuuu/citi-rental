"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, Quote, Star } from "lucide-react";
import {
  animate,
  motion,
  MotionConfig,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  wrap,
} from "motion/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PHOTO_MORPH,
  PHOTO_TILE_SIZES,
  photoAlt,
  photoCaption,
  ReviewPhotoLightbox,
  type LightboxPhoto,
} from "@/features/reviews/components/review-photo-lightbox";
import type { PublicReview } from "@/features/reviews/types/public-review";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<PublicReview["source"], string | null> = {
  facebook: "Recommended on Facebook",
  google: "Reviewed on Google",
  direct: null,
  website: "Verified renter",
  other: null,
};

/** Slow enough to read a quote as it passes. */
const QUOTE_SPEED = 28;
const PHOTO_SPEED = 40;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** Longer quotes are clamped on the card and read in full in a dialog. */
const LONG_QUOTE = 240;
/** Shorter quotes are set larger, so a one-liner doesn't sit in an empty card. */
const SHORT_QUOTE = 110;

/**
 * Two rows that drift in opposite directions: renter quotes, then handover
 * photos. A photo carries a name only when the owner attached it to that
 * renter's own review, so it is never captioned with someone else's words.
 *
 * A row eases to a stop while hovered, keyboard-focused, or held on touch;
 * the toggle pauses both, and so does an open review or photo. A photo
 * enlarges out of its tile (shared `layoutId`) and the rows stay put until
 * it has morphed back in. With reduced motion the rows sit still and scroll
 * sideways, and the photo opens without the morph.
 *
 * `children` is the call to action shown under the rows.
 */
export function ReviewWall({
  reviews,
  children,
}: {
  reviews: PublicReview[];
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [userPaused, setUserPaused] = useState(false);
  const [openReview, setOpenReview] = useState<PublicReview | null>(null);
  const [openPhoto, setOpenPhoto] = useState<LightboxPhoto | null>(null);
  // The tile the open photo returns to; cleared once the morph back ends.
  const [photoHome, setPhotoHome] = useState<string | null>(null);
  const paused = userPaused || openReview !== null || photoHome !== null;
  const openPhotoFrom = (photo: LightboxPhoto) => {
    setPhotoHome(photo.layoutId);
    setOpenPhoto(photo);
  };
  const quotes = reviews.filter((review) => review.reviewer_name && review.body);
  const photos = reviews.filter((review) => review.photo_url);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mt-10 space-y-4">
        {quotes.length ? (
          <MarqueeRow
            direction={-1}
            label="Customer reviews"
            paused={paused}
            pxPerSecond={QUOTE_SPEED}
            still={Boolean(reduce)}
            renderItems={(copy) =>
              quotes.map((review) => (
                <QuoteCard
                  copy={copy}
                  key={review.id}
                  onReadMore={setOpenReview}
                  review={review}
                />
              ))
            }
          />
        ) : null}
        {photos.length ? (
          <MarqueeRow
            direction={1}
            label="Customer photos"
            paused={paused}
            pxPerSecond={PHOTO_SPEED}
            still={Boolean(reduce)}
            renderItems={(copy) =>
              photos.map((review) => {
                const layoutId = `review-photo-${review.id}-${copy ? "b" : "a"}`;
                return (
                  <PhotoTile
                    copy={copy}
                    key={review.id}
                    layoutId={layoutId}
                    onOpen={openPhotoFrom}
                    raised={photoHome === layoutId}
                    review={review}
                  />
                );
              })
            }
          />
        ) : null}
      </div>

      <div className="mx-auto mt-10 flex max-w-7xl flex-col items-center gap-3 px-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-6 lg:px-8">
        <div className="hidden sm:block" />
        <div className="flex flex-col items-center gap-2 sm:flex-row">{children}</div>
        {reduce ? null : (
          <Button
            aria-pressed={userPaused}
            className="rounded-full text-muted-foreground sm:justify-self-end"
            onClick={() => setUserPaused((value) => !value)}
            size="lg"
            variant="ghost"
          >
            {userPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            <span className="text-sm">{userPaused ? "Play reviews" : "Pause reviews"}</span>
          </Button>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setOpenReview(null);
        }}
        open={openReview !== null}
      >
        <DialogContent className="gap-5 p-6 sm:max-w-lg">
          {openReview ? (
            <>
              <DialogHeader className="flex-row items-center gap-3 pr-8">
                <ReviewerAvatar review={openReview} />
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold text-brand-950">
                    {openReview.reviewer_name}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {reviewMeta(openReview) || "Zeke renter"}
                  </DialogDescription>
                </div>
              </DialogHeader>
              <div>
                <Quote aria-hidden="true" className="size-5 text-teal-500" />
                <p className="mt-3 text-base leading-7 text-pretty text-brand-900">
                  {openReview.body}
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReviewPhotoLightbox
        onClose={() => setOpenPhoto(null)}
        onExitComplete={() => setPhotoHome(null)}
        photo={openPhoto}
      />
    </MotionConfig>
  );
}

function MarqueeRow({
  renderItems,
  direction,
  label,
  paused,
  pxPerSecond,
  still,
}: {
  /**
   * The row's items. They render twice for a seamless loop; the second copy
   * (`copy`) is hidden from screen readers and Tab, but stays clickable since
   * it is on screen half the time.
   */
  renderItems: (copy: boolean) => ReactNode;
  /** -1 drifts left, 1 drifts right. */
  direction: -1 | 1;
  label: string;
  paused: boolean;
  pxPerSecond: number;
  still: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const loopWidth = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState(false);
  // Off-screen rows stop ticking.
  const inView = useInView(rootRef, { margin: "200px 0px" });
  const offset = useMotionValue(0);
  const speed = useMotionValue(1);
  const transform = useTransform(offset, (value) => `translateX(${value}px)`);

  // The track holds two copies; shifting by one copy's width loops seamlessly.
  useEffect(() => {
    const copy = copyRef.current;
    if (!copy) return;
    const observer = new ResizeObserver(() => {
      loopWidth.current = copy.offsetWidth;
    });
    observer.observe(copy);
    return () => observer.disconnect();
  }, []);

  // Ease to a stop instead of freezing mid-motion; pick up again gently.
  const stopped = paused || hovered || focused || held;
  useEffect(() => {
    const controls = animate(speed, stopped ? 0 : 1, {
      duration: stopped ? 0.3 : 0.6,
      ease: stopped ? EASE_OUT : EASE_IN_OUT,
    });
    return () => controls.stop();
  }, [stopped, speed]);

  useAnimationFrame((_, delta) => {
    const width = loopWidth.current;
    if (still || !inView || !width || speed.get() === 0) return;
    const step = direction * pxPerSecond * speed.get() * (delta / 1000);
    offset.set(wrap(-width, 0, offset.get() + step));
  });

  if (still)
    return (
      <div
        aria-label={label}
        className="flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8"
        role="region"
        tabIndex={0}
      >
        {renderItems(false)}
      </div>
    );

  return (
    <motion.div
      aria-label={label}
      // Clip sideways only: an enlarged photo morphing back into its tile
      // passes above and below the row. Edge fades are overlays for the same
      // reason; a mask would cut it off too.
      className="relative overflow-x-clip"
      // Keyboard focus only: a mouse click on "Read full review" shouldn't
      // keep the row stopped after the pointer leaves.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
      onHoverEnd={() => setHovered(false)}
      onHoverStart={() => setHovered(true)}
      onPointerCancel={() => setHeld(false)}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") setHeld(true);
      }}
      onPointerUp={() => setHeld(false)}
      ref={rootRef}
      role="region"
    >
      <motion.div className="flex w-max py-1" style={{ transform }}>
        <div className="flex shrink-0 gap-4 pr-4" ref={copyRef}>
          {renderItems(false)}
        </div>
        <div aria-hidden="true" className="flex shrink-0 gap-4 pr-4">
          {renderItems(true)}
        </div>
      </motion.div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[6%] bg-linear-to-r from-background to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[6%] bg-linear-to-l from-background to-transparent"
      />
    </motion.div>
  );
}

function QuoteCard({
  review,
  copy,
  onReadMore,
}: {
  review: PublicReview;
  copy: boolean;
  onReadMore: (review: PublicReview) => void;
}) {
  const body = review.body ?? "";
  const long = body.length > LONG_QUOTE;
  const short = body.length <= SHORT_QUOTE;
  const meta = reviewMeta(review);
  return (
    <figure className="flex w-75 shrink-0 snap-start flex-col rounded-2xl bg-card p-6 ring-1 ring-border ring-inset sm:w-90">
      {review.rating ? (
        <span
          aria-label={`${review.rating} out of 5 stars`}
          className="flex shrink-0 gap-0.5"
          role="img"
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              aria-hidden="true"
              className={cn(
                "size-4",
                star <= review.rating! ? "fill-gold-500 text-gold-500" : "fill-transparent text-border",
              )}
              key={star}
            />
          ))}
        </span>
      ) : (
        <Quote aria-hidden="true" className="size-5 shrink-0 text-teal-500" />
      )}
      <blockquote
        className={cn(
          "mt-3 text-pretty text-brand-900",
          short
            ? "font-display text-xl leading-8 font-medium tracking-[-0.01em]"
            : "text-[0.9375rem] leading-7",
          long && "line-clamp-6",
        )}
      >
        {body}
      </blockquote>
      {long ? (
        <Button
          className="mt-1 h-11 self-start px-0 text-teal-700 shadow-none"
          onClick={() => onReadMore(review)}
          tabIndex={copy ? -1 : undefined}
          variant="link"
        >
          Read full review
          <span className="sr-only"> from {review.reviewer_name}</span>
        </Button>
      ) : null}
      <figcaption className="mt-auto flex items-center gap-3 pt-5">
        <ReviewerAvatar review={review} />
        <span className="min-w-0">
          <span className="block font-semibold text-brand-950">
            {review.reviewer_name}
          </span>
          {meta ? (
            <span className="block text-xs text-muted-foreground">{meta}</span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}

function PhotoTile({
  review,
  layoutId,
  copy,
  raised,
  onOpen,
}: {
  review: PublicReview;
  layoutId: string;
  copy: boolean;
  /** Above its neighbours while it is open or morphing back. */
  raised: boolean;
  onOpen: (photo: LightboxPhoto) => void;
}) {
  const caption = photoCaption(review);
  return (
    <motion.button
      aria-label={`Enlarge photo: ${caption || photoAlt(review)}`}
      className={cn(
        "group relative aspect-3/4 h-64 shrink-0 cursor-zoom-in snap-start overflow-hidden bg-brand-50 ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-80",
        raised && "z-30",
      )}
      layoutId={layoutId}
      onClick={() => onOpen({ review, layoutId })}
      style={{ borderRadius: 16 }}
      tabIndex={copy ? -1 : undefined}
      transition={PHOTO_MORPH}
      type="button"
    >
      <Image
        alt=""
        className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        fill
        sizes={PHOTO_TILE_SIZES}
        src={review.photo_url!}
      />
      {caption ? (
        <span className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(7_17_31/0.7),transparent)] px-4 pt-10 pb-3 text-left text-sm font-medium text-white">
          {caption}
        </span>
      ) : null}
    </motion.button>
  );
}

/** The renter's own photo when the owner attached one, else their initials. */
function ReviewerAvatar({ review }: { review: PublicReview }) {
  return review.photo_url ? (
    <Image
      alt=""
      className="size-10 shrink-0 rounded-full object-cover"
      height={40}
      src={review.photo_url}
      width={40}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700"
    >
      {initials(review.reviewer_name ?? "")}
    </span>
  );
}

function reviewMeta(review: PublicReview) {
  return [review.vehicle_label, SOURCE_LABELS[review.source]].filter(Boolean).join(" · ");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}
