import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Fuel, Settings2, Users } from "lucide-react";

import { CarIllustration } from "@/components/landing/car-illustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bookingContinuePath, bookingFormPath } from "@/features/booking/lib/booking-continue";
import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

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
  vehicle: PublicFleetVehicle;
  bookingQuery?: string;
  /** When true, skip sign-in/guest choice and go straight to the form. */
  signedIn?: boolean;
};

export function FleetVehicleCard({
  vehicle,
  bookingQuery,
  signedIn = false,
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
  const href = signedIn
    ? bookingFormPath(vehicle.id, tripQuery)
    : bookingContinuePath(vehicle.id, tripQuery);

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-teal-500/40 hover:shadow-md">
      <div className="relative flex min-h-52 items-center justify-center overflow-hidden bg-brand-50 px-6 pt-6">
        <Badge className="absolute top-4 left-4 z-10 bg-card text-teal-700 shadow-xs hover:bg-card">
          <CheckCircle2 aria-hidden="true" />
          Available
        </Badge>
        {vehicle.photo_url ? (
          <Image
            alt={vehicle.name}
            className="object-cover"
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            src={vehicle.photo_url}
          />
        ) : (
          <CarIllustration
            className={illustrationColor(vehicle.category)}
            variant={illustrationVariant(vehicle.category)}
          />
        )}
      </div>

      <CardContent className="p-6">
        <div>
          <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
            {categoryLabel}
          </p>
          <h3 className="mt-1 text-xl font-bold text-brand-950">{vehicle.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle.make} {vehicle.model} · {vehicle.year}
          </p>
          <VehicleRateQuote
            className="mt-3"
            dailyRate={vehicle.daily_rate}
            end={tripQuery.end}
            start={tripQuery.start}
          />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4 text-center text-xs text-muted-foreground">
          <span className="flex flex-col items-center gap-1.5">
            <Users aria-hidden="true" className="size-4 text-brand-600" />
            {vehicle.seating_capacity ? `${vehicle.seating_capacity} seats` : "Seats —"}
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <Settings2 aria-hidden="true" className="size-4 text-brand-600" />
            {transmission}
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <Fuel aria-hidden="true" className="size-4 text-brand-600" />
            {fuel}
          </span>
        </div>

        <Button asChild className="mt-5 w-full" size="lg">
          <Link href={href}>Book this car</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
