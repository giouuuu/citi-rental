"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { CarFront, CalendarDays, MapPin, Search } from "lucide-react";

import { FleetVehicleCard } from "@/components/landing/fleet-vehicle-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

const FALLBACK_CATEGORIES = ["Economy", "Sedan", "SUV", "Van"] as const;

export type FleetTripFilter = {
  pickup?: string;
  start?: string;
  end?: string;
};

type VehicleListingProps = {
  vehicles: PublicFleetVehicle[];
  bookingQuery?: string;
  signedIn?: boolean;
  trip?: FleetTripFilter;
};

function formatTripDate(value?: string) {
  if (!value) return null;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(value);
    if (!Number.isFinite(fallback.getTime())) return value;
    return format(fallback, "MMM d, yyyy");
  }
  return format(parsed, "MMM d, yyyy");
}

export function VehicleListing({
  vehicles,
  bookingQuery,
  signedIn = false,
  trip,
}: VehicleListingProps) {
  const categories = useMemo(() => {
    const fromFleet = Array.from(
      new Set(
        vehicles
          .map((vehicle) => vehicle.category?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return ["All", ...(fromFleet.length ? fromFleet : [...FALLBACK_CATEGORIES])];
  }, [vehicles]);

  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const deferredCategory = useDeferredValue(category);

  const filteredVehicles = vehicles.filter((vehicle) => {
    const vehicleCategory = vehicle.category?.trim() || "Uncategorized";
    const matchesCategory =
      deferredCategory === "All" || vehicleCategory === deferredCategory;
    const haystack = [
      vehicle.name,
      vehicle.make,
      vehicle.model,
      vehicleCategory,
      String(vehicle.year),
    ]
      .join(" ")
      .toLowerCase();
    return matchesCategory && (!deferredQuery || haystack.includes(deferredQuery));
  });

  const pickupLabel = formatTripDate(trip?.start);
  const returnLabel = formatTripDate(trip?.end);
  const hasTripDates = Boolean(pickupLabel && returnLabel);
  const hasTrip = hasTripDates || Boolean(trip?.pickup?.trim());

  function resetFilters() {
    setQuery("");
    startTransition(() => setCategory("All"));
  }

  return (
    <section className="relative pt-10 pb-20 sm:pt-12 sm:pb-24" id="fleet">
      <div className="fleet-dot-grid absolute inset-x-0 top-0 h-52 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
              Ready when you are
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Available cars from our fleet
            </h2>
            {hasTrip ? (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {trip?.pickup?.trim() ? (
                  <p className="inline-flex items-center gap-1.5">
                    <MapPin aria-hidden="true" className="size-3.5 text-teal-700" />
                    <span>{trip.pickup.trim()}</span>
                  </p>
                ) : null}
                {hasTripDates ? (
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays
                      aria-hidden="true"
                      className="size-3.5 text-teal-700"
                    />
                    <span>
                      {pickupLabel} → {returnLabel}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
                Choose dates above to see cars free for your trip, then book
                online.
              </p>
            )}
          </div>
          <p className="shrink-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-brand-950">
            <span className="font-bold tabular-nums">{vehicles.length}</span>
            <span className="text-muted-foreground">
              {hasTripDates
                ? vehicles.length === 1
                  ? " car free for these dates"
                  : " cars free for these dates"
                : vehicles.length === 1
                  ? " car ready today"
                  : " cars ready today"}
            </span>
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
          <div
            aria-label="Filter cars by type"
            className="flex gap-2 overflow-x-auto pb-1 lg:pb-0"
            role="group"
          >
            {categories.map((item) => (
              <Button
                aria-pressed={category === item}
                className="min-w-fit"
                key={item}
                onClick={() => startTransition(() => setCategory(item))}
                size="sm"
                type="button"
                variant={category === item ? "default" : "outline"}
              >
                {item}
              </Button>
            ))}
          </div>

          <Field className="w-full lg:max-w-xs">
            <FieldLabel className="sr-only" htmlFor="search-cars">
              Search cars
            </FieldLabel>
            <InputGroup className="h-10">
              <InputGroupInput
                id="search-cars"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by car or type"
                value={query}
              />
              <InputGroupAddon align="inline-end">
                <Search aria-hidden="true" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </div>

        {filteredVehicles.length ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredVehicles.map((vehicle) => (
              <FleetVehicleCard
                bookingQuery={bookingQuery}
                key={vehicle.id}
                signedIn={signedIn}
                vehicle={vehicle}
              />
            ))}
          </div>
        ) : (
          <Empty className="mt-8 min-h-64 border border-dashed border-border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CarFront aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {vehicles.length
                  ? "No matching cars"
                  : hasTripDates
                    ? "No cars free for these dates"
                    : "No available cars right now"}
              </EmptyTitle>
              <EmptyDescription>
                {vehicles.length
                  ? "Try another car name or clear the selected vehicle type."
                  : hasTripDates
                    ? "Try different dates, or clear the search to browse the full available fleet."
                    : "No cars are currently marked available in the fleet. Check back soon or contact support."}
              </EmptyDescription>
            </EmptyHeader>
            {vehicles.length ? (
              <EmptyContent>
                <Button onClick={resetFilters} type="button">
                  Clear filters
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </div>
    </section>
  );
}
