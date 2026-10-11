"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { CarFront, Images } from "lucide-react";

import {
  GalleryArrow,
  GalleryPhotoStack,
  GalleryThumbnails,
} from "@/components/landing/vehicle-gallery-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPhp } from "@/features/shared/lib/money";
import { vehicleModelLine } from "@/features/vehicles/lib/vehicle-model-line";
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
 * The booking page's car as one compact row: cover, name and day rate, with
 * its photos and the rest of the fleet a tap away in a dialog. Switching
 * keeps everything already typed in the form.
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
  const [view, setView] = useState<"photos" | "cars" | null>(null);
  const photos = vehiclePhotos(vehicle);
  const cover = vehicle.photo_url ?? vehicle.gallery[0]?.url;
  const modelLine = vehicleModelLine(vehicle);

  return (
    <section
      aria-label="Your car"
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 pr-3"
    >
      <button
        aria-label={`See photos of the ${vehicle.name}`}
        className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-brand-50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        disabled={!photos.length}
        onClick={() => setView("photos")}
        type="button"
      >
        {cover ? (
          <Image alt="" className="object-cover" fill sizes="96px" src={cover} />
        ) : (
          <CarFront
            aria-hidden="true"
            className="absolute inset-0 m-auto size-7 text-brand-300"
          />
        )}
        {photos.length > 1 ? (
          <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-brand-950/65 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
            <Images aria-hidden="true" className="size-2.5" />
            {photos.length}
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-950">{vehicle.name}</p>
        <p className="truncate text-sm text-muted-foreground tabular-nums">
          {modelLine ? `${modelLine} · ` : null}
          {formatPhp(vehicle.daily_rate)}/day
        </p>
        <div className="mt-0.5 flex gap-4 text-sm">
          {photos.length ? (
            <button
              className="-my-1 py-1 font-medium text-teal-700 underline-offset-4 hover:underline"
              onClick={() => setView("photos")}
              type="button"
            >
              Photos
            </button>
          ) : null}
          {fleet.length > 1 ? (
            <button
              className="-my-1 py-1 font-medium text-teal-700 underline-offset-4 hover:underline"
              onClick={() => setView("cars")}
              type="button"
            >
              Change car
            </button>
          ) : null}
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
        open={view !== null}
      >
        <DialogContent className="max-h-[min(90vh,760px)] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>
              {view === "cars" ? "Change car" : vehicle.name}
            </DialogTitle>
            <DialogDescription>
              {view === "cars"
                ? "Your dates and details stay as they are."
                : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
            </DialogDescription>
          </DialogHeader>
          {view === "cars" ? (
            <ul
              aria-label="Cars"
              className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3"
            >
              {fleet.map((car) => (
                <li key={car.id}>
                  <CarChoice
                    car={car}
                    onSelect={() => {
                      onSelect(car);
                      setView(null);
                    }}
                    selected={car.id === vehicle.id}
                  />
                </li>
              ))}
            </ul>
          ) : (
            // Keyed so a newly chosen car starts on its cover angle.
            <CarPhotos key={vehicle.id} vehicle={vehicle} />
          )}
        </DialogContent>
      </Dialog>
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
