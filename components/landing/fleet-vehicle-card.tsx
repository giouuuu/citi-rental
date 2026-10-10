"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Fuel, Images, Settings2, Users } from "lucide-react";
import { motion } from "motion/react";

import { CarIllustration } from "@/components/landing/car-illustration";
import {
  GALLERY_MORPH,
  VehicleGalleryDialog,
  VehicleGalleryTrigger,
} from "@/components/landing/vehicle-gallery-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bookingFormPath } from "@/features/booking/lib/booking-continue";
import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import { cn } from "@/lib/utils";

const PHOTO_SIZES = "(max-width: 768px) 100vw, 33vw";

/** Values staff type when they don't know a car's make or model yet. */
const PLACEHOLDER_VALUES = new Set(["", "na", "n/a", "none", "-", "tbd", "unknown"]);

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function realValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return PLACEHOLDER_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
}

/** "2026 Toyota Avanza", skipping placeholder make/model ("NA") rows. */
function modelLine(vehicle: PublicListedVehicle) {
  const makeModel = [realValue(vehicle.make), realValue(vehicle.model)].filter(Boolean).join(" ");
  return makeModel ? `${vehicle.year} ${makeModel}` : `${vehicle.year} model`;
}

function illustrationVariant(category: string | null) {
  const normalized = (category ?? "").toLowerCase();
  if (normalized.includes("van") || normalized.includes("mpv")) return "van" as const;
  if (normalized.includes("suv") || normalized.includes("crossover")) return "suv" as const;
  return "sedan" as const;
}

function illustrationColor(category: string | null) {
  switch (illustrationVariant(category)) {
    case "van":
      return "text-teal-700";
    case "suv":
      return "text-brand-700";
    default:
      return "text-teal-600";
  }
}

type FleetVehicleCardProps = {
  vehicle: PublicListedVehicle;
  bookingQuery?: string;
  /** Flat fee to hold a booking, from Settings. */
  reservationFee?: number | null;
  /** Settings → driver day rate, for the with-driver quote. */
  driverDailyRate?: number | null;
};

export function FleetVehicleCard({
  vehicle,
  bookingQuery,
  reservationFee,
  driverDailyRate,
}: FleetVehicleCardProps) {
  // Lifted above its neighbours while the photo is in (or flying back from) the gallery.
  const [raised, setRaised] = useState(false);
  const categoryLabel = vehicle.category?.trim() || "Fleet";
  const query = bookingQuery
    ? Object.fromEntries(new URLSearchParams(bookingQuery).entries())
    : {};
  const tripQuery = {
    pickup: query.pickup,
    start: query.start,
    end: query.end,
    mode: query.mode,
  };
  const hasTripDates = Boolean(tripQuery.start && tripQuery.end);
  const coverUrl = vehicle.photo_url ?? vehicle.gallery[0]?.url ?? null;
  const href = bookingFormPath(vehicle.id, tripQuery);
  const photoLayoutId = `fleet-photo-${vehicle.id}`;

  const specs = [
    vehicle.seating_capacity
      ? { icon: Users, label: `${vehicle.seating_capacity} seats` }
      : null,
    vehicle.transmission ? { icon: Settings2, label: titleCase(vehicle.transmission) } : null,
    vehicle.fuel_type ? { icon: Fuel, label: titleCase(vehicle.fuel_type) } : null,
  ].filter((spec) => spec !== null);

  const coverImage = coverUrl ? (
    <Image
      alt={vehicle.name}
      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
      fill
      sizes={PHOTO_SIZES}
      src={coverUrl}
    />
  ) : null;

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-visible rounded-2xl border-0 p-2 shadow-none ring-1 ring-border transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgb(7_17_31/0.4)] hover:ring-teal-500/40",
        raised && "z-30",
      )}
    >
      {coverUrl && vehicle.gallery.length ? (
        <VehicleGalleryDialog
          cover={{ src: coverUrl, sizes: PHOTO_SIZES }}
          driverDailyRate={driverDailyRate}
          layoutId={photoLayoutId}
          onExitComplete={() => setRaised(false)}
          onOpenChange={(open) => {
            if (open) setRaised(true);
          }}
          reservationFee={reservationFee}
          trip={tripQuery}
          vehicle={vehicle}
        >
          <motion.div
            className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)]"
            layoutId={photoLayoutId}
            style={{ borderRadius: 12 }}
            transition={GALLERY_MORPH}
          >
            <VehicleGalleryTrigger asChild>
              <button
                aria-label={`View ${vehicle.gallery.length} photos of ${vehicle.name}`}
                className="absolute inset-0 cursor-zoom-in rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                type="button"
              >
                {coverImage}
                <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-950/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors duration-200 group-hover:bg-brand-950/70">
                  <Images aria-hidden="true" className="size-3.5" />
                  <span className="tabular-nums">{vehicle.gallery.length}</span> photos
                </span>
              </button>
            </VehicleGalleryTrigger>
          </motion.div>
        </VehicleGalleryDialog>
      ) : (
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)] px-6 pt-6">
          {coverImage ?? (
            <CarIllustration
              className={`${illustrationColor(vehicle.category)} transition-transform duration-500 ease-out group-hover:translate-x-1`}
              variant={illustrationVariant(vehicle.category)}
            />
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col px-3 pt-4 pb-2 sm:px-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium text-teal-700">{categoryLabel}</p>
          <p className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            {hasTripDates ? "Free for your dates" : "Available"}
          </p>
        </div>
        <h3 className="mt-1 font-display text-xl font-semibold tracking-[-0.015em] text-brand-950">
          {vehicle.name}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{modelLine(vehicle)}</p>

        {specs.length ? (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-brand-700">
            {specs.map(({ icon: Icon, label }) => (
              <li className="inline-flex items-center gap-1.5" key={label}>
                <Icon aria-hidden="true" className="size-4 text-brand-400" />
                {label}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          <VehicleRateQuote
            className="min-w-0"
            end={tripQuery.end}
            rates={{
              daily: vehicle.daily_rate,
              halfDay: vehicle.half_day_rate,
              hourly: vehicle.hourly_rate,
            }}
            priceClassName="font-display text-xl tracking-[-0.015em]"
            reservationFee={reservationFee}
            start={tripQuery.start}
          />
          <Button asChild className="shrink-0" size="lg">
            <Link href={href}>Book this car</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
