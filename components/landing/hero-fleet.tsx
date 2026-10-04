"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { formatPhp } from "@/features/shared/lib/money";
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
      <Link
        className="shrink-0 font-medium text-teal-700 underline-offset-4 hover:underline"
        href={car.bookHref}
      >
        Book this car
      </Link>
    </div>
  );
}
