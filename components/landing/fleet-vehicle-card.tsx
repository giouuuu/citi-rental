import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Fuel, Images, Settings2, Users } from "lucide-react";

import { CarIllustration } from "@/components/landing/car-illustration";
import { VehicleGalleryDialog } from "@/components/landing/vehicle-gallery-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bookingContinuePath, bookingFormPath } from "@/features/booking/lib/booking-continue";
import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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
  /** When true, skip sign-in/guest choice and go straight to the form. */
  signedIn?: boolean;
  /** Flat fee to hold a booking, from Settings. */
  reservationFee?: number | null;
};

export function FleetVehicleCard({
  vehicle,
  bookingQuery,
  signedIn = false,
  reservationFee,
}: FleetVehicleCardProps) {
  const categoryLabel = vehicle.category?.trim() || "Fleet";
  const transmission = vehicle.transmission ? titleCase(vehicle.transmission) : "—";
  const fuel = vehicle.fuel_type ? titleCase(vehicle.fuel_type) : "—";
  const query = bookingQuery
    ? Object.fromEntries(new URLSearchParams(bookingQuery).entries())
    : {};
  const tripQuery = {
    pickup: query.pickup,
    start: query.start,
    end: query.end,
  };
  const coverUrl = vehicle.photo_url ?? vehicle.gallery[0]?.url ?? null;
  const href = signedIn
    ? bookingFormPath(vehicle.id, tripQuery)
    : bookingContinuePath(vehicle.id, tripQuery);

  return (
    <Card className="group gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-border transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgb(7_17_31/0.4)] hover:ring-teal-500/40">
      <div className="relative m-2 mb-0 flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_90%_at_50%_100%,var(--brand-100),var(--brand-50)_70%)] px-6 pt-6">
        <Badge className="pointer-events-none absolute top-3 left-3 z-10 rounded-md bg-card text-teal-700 shadow-xs hover:bg-card">
          <CheckCircle2 aria-hidden="true" />
          Available
        </Badge>
        {coverUrl && vehicle.gallery.length ? (
          <VehicleGalleryDialog
            bookHref={href}
            reservationFee={reservationFee}
            trip={tripQuery}
            vehicle={vehicle}
          >
            <button
              aria-label={`View ${vehicle.gallery.length} photos of ${vehicle.name}`}
              className="absolute inset-0 z-[1] cursor-zoom-in rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              type="button"
            >
              <Image
                alt={vehicle.name}
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                src={coverUrl}
              />
              <span className="absolute right-3 bottom-3 inline-flex translate-y-0.5 items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white opacity-90 backdrop-blur-md transition-[opacity,transform] duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100">
                <Images aria-hidden="true" className="size-3.5" />
                <span className="tabular-nums">{vehicle.gallery.length}</span> photos
              </span>
            </button>
          </VehicleGalleryDialog>
        ) : coverUrl ? (
          <Image
            alt={vehicle.name}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            src={coverUrl}
          />
        ) : (
          <CarIllustration
            className={`${illustrationColor(vehicle.category)} transition-transform duration-500 ease-out group-hover:translate-x-1`}
            variant={illustrationVariant(vehicle.category)}
          />
        )}
      </div>

      <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
        <div>
          <p className="text-sm font-medium text-teal-700">{categoryLabel}</p>
          <h3 className="mt-0.5 font-display text-xl font-semibold tracking-[-0.015em] text-brand-950">
            {vehicle.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle.make} {vehicle.model} · {vehicle.year}
          </p>
          <VehicleRateQuote
            className="mt-3"
            rates={{
              daily: vehicle.daily_rate,
              halfDay: vehicle.half_day_rate,
              hourly: vehicle.hourly_rate,
            }}
            end={tripQuery.end}
            reservationFee={reservationFee}
            start={tripQuery.start}
          />
        </div>

        <ul className="mt-5 flex flex-wrap gap-2 text-xs text-brand-700">
          <li className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1.5">
            <Users aria-hidden="true" className="size-3.5 text-brand-500" />
            {vehicle.seating_capacity ? `${vehicle.seating_capacity} seats` : "Seats —"}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1.5">
            <Settings2 aria-hidden="true" className="size-3.5 text-brand-500" />
            {transmission}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1.5">
            <Fuel aria-hidden="true" className="size-3.5 text-brand-500" />
            {fuel}
          </li>
        </ul>

        <div className="mt-auto pt-5">
          <Button asChild className="w-full" size="lg">
            <Link href={href}>Book this car</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
