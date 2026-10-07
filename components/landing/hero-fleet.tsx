"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Images } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

import { VehicleGalleryDialog } from "@/components/landing/vehicle-gallery-dialog";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/features/shared/lib/money";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import { cn } from "@/lib/utils";

/** A fleet car the hero can stand on the road. */
export type HeroFleetCar = {
  id: string;
  name: string;
  color: string | null;
  imageUrl: string;
  dailyRate: number;
  /** Where "Book this car" goes, carrying the current trip search. */
  bookHref: string;
  /** The full listing, for the photo gallery the car opens. */
  vehicle: PublicListedVehicle;
  /** Trip dates, so the gallery quotes the same total as the search. */
  trip: { start?: string; end?: string };
  /** Flat fee to hold a booking, from Settings. */
  reservationFee: number | null;
};

type HeroFleetState = {
  cars: HeroFleetCar[];
  index: number;
  /** -1 after "previous", 1 after "next"; the swap animation reads it. */
  direction: -1 | 1;
  step: (delta: -1 | 1) => void;
};

const HeroFleetContext = createContext<HeroFleetState | null>(null);

export function HeroFleetProvider({
  cars,
  children,
}: {
  cars: HeroFleetCar[];
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(1);

  const step = useCallback(
    (delta: -1 | 1) => {
      if (cars.length < 2) return;
      setDirection(delta);
      setIndex((current) => (current + delta + cars.length) % cars.length);
    },
    [cars.length],
  );

  const value = useMemo(
    () => ({ cars, index: Math.min(index, Math.max(cars.length - 1, 0)), direction, step }),
    [cars, index, direction, step],
  );

  return <HeroFleetContext.Provider value={value}>{children}</HeroFleetContext.Provider>;
}

export function useHeroFleet(): HeroFleetState {
  return (
    useContext(HeroFleetContext) ?? {
      cars: [],
      index: 0,
      direction: 1,
      step: () => {},
    }
  );
}

function carLabel(car: HeroFleetCar) {
  const color = car.color?.trim();
  return color && !car.name.toLowerCase().includes(color.toLowerCase())
    ? `${car.name} · ${color}`
    : car.name;
}

/** Previous / next buttons flanking the car. Hidden with fewer than two cars. */
export function HeroCarControls({ className }: { className?: string }) {
  const { cars, index, step } = useHeroFleet();
  if (cars.length < 2) return null;
  const current = cars[index];

  const buttonClassName =
    "pointer-events-auto size-11 rounded-full border-white/60 bg-white/75 text-brand-950 shadow-[0_8px_24px_-12px_rgb(7_17_31/0.5)] backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-white active:scale-95 sm:size-12";

  return (
    <div className={cn("pointer-events-none flex items-center justify-between", className)}>
      <Button
        aria-label="Previous car"
        className={buttonClassName}
        onClick={() => step(-1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Button>
      <p aria-live="polite" className="sr-only">
        {current ? `Showing ${carLabel(current)}, ${index + 1} of ${cars.length}` : null}
      </p>
      <Button
        aria-label="Next car"
        className={buttonClassName}
        onClick={() => step(1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </Button>
    </div>
  );
}

/** How far the cursor bubble closes on the pointer each frame (0–1). */
const CURSOR_FOLLOW = 0.22;

/**
 * Opens the shown car's photo gallery: an invisible button over the car on
 * the road. With a mouse, a "Book me" bubble replaces the cursor while it is
 * over the car, trailing the pointer with a light lag. The always-visible
 * way in is "Photos" in `HeroCarSummary`.
 */
export function HeroCarGallery({ className }: { className?: string }) {
  const { cars, index } = useHeroFleet();
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const [bubbleShown, setBubbleShown] = useState(false);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const car = cars[index];
  const count = car?.vehicle.gallery.length ?? 0;
  if (!car || !count) return null;

  function placeBubble() {
    const element = bubbleRef.current;
    if (!element) return;
    const { x, y } = current.current;
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  function followPointer() {
    frame.current = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const follow = reduce ? 1 : CURSOR_FOLLOW;
    current.current.x += (target.current.x - current.current.x) * follow;
    current.current.y += (target.current.y - current.current.y) * follow;
    placeBubble();
    const settling =
      Math.abs(target.current.x - current.current.x) > 0.2 ||
      Math.abs(target.current.y - current.current.y) > 0.2;
    if (settling) frame.current = requestAnimationFrame(followPointer);
  }

  function aim(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    target.current = { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  return (
    <VehicleGalleryDialog
      bookHref={car.bookHref}
      reservationFee={car.reservationFee}
      trip={car.trip}
      vehicle={car.vehicle}
    >
      <button
        aria-label={`View ${count} photos of ${carLabel(car)}`}
        className={cn(
          "pointer-events-auto cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none [@media(hover:hover)_and_(pointer:fine)]:cursor-none",
          className,
        )}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          aim(event);
          // Appear where the pointer came in, not slide over from the last exit.
          current.current = { ...target.current };
          placeBubble();
          setBubbleShown(true);
        }}
        onPointerLeave={() => setBubbleShown(false)}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          aim(event);
          if (!frame.current) frame.current = requestAnimationFrame(followPointer);
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 will-change-transform"
          ref={bubbleRef}
        >
          <span
            className={cn(
              "flex size-22 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full bg-teal-700/90 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgb(4_47_44/0.7)] ring-1 ring-white/30 backdrop-blur-md transition-[opacity,scale] ease-out",
              bubbleShown
                ? "scale-100 opacity-100 duration-200"
                : "scale-50 opacity-0 duration-150",
            )}
          >
            Book me
            <ArrowUpRight aria-hidden="true" className="size-4 text-teal-100" />
          </span>
        </span>
      </button>
    </VehicleGalleryDialog>
  );
}

/** The selected car's name, rate and booking link, for the search card. */
export function HeroCarSummary() {
  const { cars, index } = useHeroFleet();
  const car = cars[index];
  if (!car) return null;

  return (
    <div className="flex min-w-0 items-center gap-3 text-sm" key={car.id}>
      {/* Reset the delay inherited from the search card's own intro. */}
      <p className="focus-in min-w-0 truncate" style={{ "--focus-delay": "0ms" } as CSSProperties}>
        <span className="font-semibold text-brand-950">{carLabel(car)}</span>
        <span className="text-muted-foreground">
          {" · "}
          <span className="tabular-nums">{formatPhp(car.dailyRate)}</span>/day
        </span>
      </p>
      {cars.length > 1 ? (
        <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
          {index + 1}/{cars.length}
        </span>
      ) : null}
      {car.vehicle.gallery.length ? (
        <VehicleGalleryDialog
          bookHref={car.bookHref}
          reservationFee={car.reservationFee}
          trip={car.trip}
          vehicle={car.vehicle}
        >
          <button
            aria-label={`View ${car.vehicle.gallery.length} photos of ${carLabel(car)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm font-medium text-brand-700 transition-colors duration-150 hover:text-brand-950 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            type="button"
          >
            <Images aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Photos</span>
          </button>
        </VehicleGalleryDialog>
      ) : null}
      <Link
        className="shrink-0 font-medium text-teal-700 underline-offset-4 hover:underline"
        href={car.bookHref}
      >
        Book this car
      </Link>
    </div>
  );
}
