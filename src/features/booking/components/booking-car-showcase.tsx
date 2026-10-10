"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CarFront } from "lucide-react";

import {
  GalleryArrow,
  GalleryPhotoStack,
  GalleryThumbnails,
} from "@/components/landing/vehicle-gallery-dialog";
import { formatPhp } from "@/features/shared/lib/money";
import type {
  PublicListedVehicle,
  PublicVehiclePhoto,
} from "@/features/vehicles/types/public-fleet-vehicle";
import { cn } from "@/lib/utils";

/** Horizontal drag, in px, that counts as a swipe on the photo stage. */
const SWIPE_THRESHOLD = 40;

/** The car's gallery angles, or its cover photo when it has none. */
export function vehiclePhotos(vehicle: PublicListedVehicle): PublicVehiclePhoto[] {
  if (vehicle.gallery.length) return vehicle.gallery;
  return vehicle.photo_url
    ? [{ kind: "cover", label: "Photo", url: vehicle.photo_url }]
    : [];
}

/**
 * The booking page's car: its photos to page through, and the rest of the
 * fleet underneath to switch to without leaving the form.
 */
export function BookingCarShowcase({
  vehicle,
  fleet,
  onSelect,
}: {
  vehicle: PublicListedVehicle;
  fleet: PublicListedVehicle[];
  onSelect: (vehicle: PublicListedVehicle) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Bring a car picked from elsewhere (the free-cars list) into the strip's
  // view. Sideways only: the page itself must not jump.
  useEffect(() => {
    const list = listRef.current;
    const chosen = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !chosen) return;
    const bounds = list.getBoundingClientRect();
    const box = chosen.getBoundingClientRect();
    if (box.left < bounds.left || box.right > bounds.right) {
      list.scrollLeft += box.left - bounds.left - 16;
    }
  }, [vehicle.id]);

  return (
    <section
      aria-label="Car photos"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Keyed so a newly chosen car starts on its cover angle. */}
      <CarPhotos key={vehicle.id} vehicle={vehicle} />

      {fleet.length > 1 ? (
        <div className="border-t border-border px-4 pt-3 pb-4">
          <p className="text-sm font-medium text-brand-950">Switch car</p>
          <ul
            aria-label="Cars"
            ref={listRef}
            className="-mx-4 mt-2 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-1"
          >
            {fleet.map((car) => (
              <li className="w-36 shrink-0 snap-start" key={car.id}>
                <CarChoice
                  car={car}
                  onSelect={() => onSelect(car)}
                  selected={car.id === vehicle.id}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CarPhotos({ vehicle }: { vehicle: PublicListedVehicle }) {
  const photos = vehiclePhotos(vehicle);
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const current = photos[index];

  function step(delta: number) {
    setIndex((value) => (value + delta + count) % count);
  }

  return (
    <div>
      <div
        className="relative aspect-[16/10] touch-pan-y overflow-hidden bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)] select-none"
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
        onPointerDown={(event) => {
          swipeStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (swipeStart.current === null || count < 2) return;
          const delta = event.clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(delta) >= SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
        }}
      >
        {count ? (
          <GalleryPhotoStack
            index={index}
            photos={photos}
            sizes="(min-width: 768px) 720px, 100vw"
            vehicleName={vehicle.name}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-brand-300">
            <CarFront aria-hidden="true" className="size-16" />
          </div>
        )}

        {count > 1 ? (
          <>
            <p
              aria-live="polite"
              className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-brand-950/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
            >
              <span>{current?.label}</span>
              <span className="text-white/60 tabular-nums">
                {index + 1} / {count}
              </span>
            </p>
            <GalleryArrow direction="previous" onClick={() => step(-1)} />
            <GalleryArrow direction="next" onClick={() => step(1)} />
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <GalleryThumbnails
          className="px-4 pt-3 pb-3"
          index={index}
          onSelect={setIndex}
          photos={photos}
        />
      ) : null}
    </div>
  );
}

function CarChoice({
  car,
  selected,
  onSelect,
}: {
  car: PublicListedVehicle;
  selected: boolean;
  onSelect: () => void;
}) {
  const cover = car.photo_url ?? car.gallery[0]?.url;

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group/car block w-full rounded-lg p-1 text-left ring-2 transition-[box-shadow,background-color] duration-200 ease-out focus-visible:ring-ring focus-visible:outline-none",
        selected ? "bg-teal-50 ring-teal-500" : "ring-transparent hover:bg-muted",
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="relative block aspect-[4/3] overflow-hidden rounded-md bg-brand-50">
        {cover ? (
          <Image
            alt=""
            className="object-cover transition-transform duration-300 ease-out group-hover/car:scale-105"
            fill
            sizes="144px"
            src={cover}
          />
        ) : (
          <CarFront
            aria-hidden="true"
            className="absolute inset-0 m-auto size-8 text-brand-300"
          />
        )}
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium text-brand-950">
        {car.name}
      </span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {formatPhp(car.daily_rate)}/day
      </span>
    </button>
  );
}
