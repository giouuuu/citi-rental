"use client";

import { startTransition, useDeferredValue, useState } from "react";
import {
  CarFront,
  CheckCircle2,
  Fuel,
  Search,
  Settings2,
  Users,
} from "lucide-react";

import { CarIllustration } from "@/components/landing/car-illustration";
import { EmptyState } from "@/components/design-system/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const categories = ["All", "Economy", "Sedan", "SUV", "Van"] as const;
type Category = (typeof categories)[number];

const vehicles = [
  {
    name: "Suzuki Dzire",
    category: "Economy",
    seats: 5,
    transmission: "Automatic",
    fuel: "Gasoline",
    price: 1700,
    variant: "sedan" as const,
    color: "text-teal-600",
  },
  {
    name: "Toyota Vios",
    category: "Economy",
    seats: 5,
    transmission: "Automatic",
    fuel: "Gasoline",
    price: 1800,
    variant: "sedan" as const,
    color: "text-brand-500",
  },
  {
    name: "Honda City",
    category: "Sedan",
    seats: 5,
    transmission: "Automatic",
    fuel: "Gasoline",
    price: 2200,
    variant: "sedan" as const,
    color: "text-gold-500",
  },
  {
    name: "Mitsubishi Xpander",
    category: "SUV",
    seats: 7,
    transmission: "Automatic",
    fuel: "Gasoline",
    price: 3400,
    variant: "suv" as const,
    color: "text-brand-700",
  },
  {
    name: "Toyota Fortuner",
    category: "SUV",
    seats: 7,
    transmission: "Automatic",
    fuel: "Diesel",
    price: 4200,
    variant: "suv" as const,
    color: "text-offline",
  },
  {
    name: "Nissan Urvan",
    category: "Van",
    seats: 15,
    transmission: "Manual",
    fuel: "Diesel",
    price: 5200,
    variant: "van" as const,
    color: "text-teal-700",
  },
];

const priceFormatter = new Intl.NumberFormat("en-PH");

export function VehicleListing() {
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const deferredCategory = useDeferredValue(category);
  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesCategory =
      deferredCategory === "All" || vehicle.category === deferredCategory;
    const matchesQuery =
      !deferredQuery ||
      vehicle.name.toLowerCase().includes(deferredQuery) ||
      vehicle.category.toLowerCase().includes(deferredQuery);

    return matchesCategory && matchesQuery;
  });

  function resetFilters() {
    setQuery("");
    startTransition(() => setCategory("All"));
  }

  return (
    <section className="relative py-20 sm:py-24" id="fleet">
      <div className="fleet-dot-grid absolute inset-x-0 top-0 h-52 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
            Ready when you are
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
            Cars for every kind of trip
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            From quick city errands to full-family road trips, choose a
            well-maintained vehicle with straightforward daily rates.
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
                onClick={() =>
                  startTransition(() => setCategory(item as Category))
                }
                size="sm"
                type="button"
                variant={category === item ? "default" : "outline"}
              >
                {item}
              </Button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Label className="sr-only" htmlFor="search-cars">
              Search cars
            </Label>
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-10 pl-9"
              id="search-cars"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by car or type"
              type="search"
              value={query}
            />
          </div>
        </div>

        {filteredVehicles.length ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredVehicles.map((vehicle) => (
              <Card
                className="group gap-0 overflow-hidden py-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-teal-500/40 hover:shadow-md"
                key={vehicle.name}
              >
                <div className="relative flex min-h-52 items-center bg-brand-50 px-6 pt-6">
                  <Badge className="absolute top-4 left-4 bg-card text-teal-700 shadow-xs hover:bg-card">
                    <CheckCircle2 aria-hidden="true" />
                    Available
                  </Badge>
                  <CarIllustration
                    className={vehicle.color}
                    variant={vehicle.variant}
                  />
                </div>

                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
                        {vehicle.category}
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-brand-950">
                        {vehicle.name}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">From</p>
                      <p className="text-lg font-bold text-brand-950">
                        ₱{priceFormatter.format(vehicle.price)}
                      </p>
                      <p className="text-xs text-muted-foreground">per day</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4 text-center text-xs text-muted-foreground">
                    <span className="flex flex-col items-center gap-1.5">
                      <Users aria-hidden="true" className="size-4 text-brand-600" />
                      {vehicle.seats} seats
                    </span>
                    <span className="flex flex-col items-center gap-1.5">
                      <Settings2
                        aria-hidden="true"
                        className="size-4 text-brand-600"
                      />
                      {vehicle.transmission}
                    </span>
                    <span className="flex flex-col items-center gap-1.5">
                      <Fuel aria-hidden="true" className="size-4 text-brand-600" />
                      {vehicle.fuel}
                    </span>
                  </div>

                  <Button asChild className="mt-5 w-full" size="lg">
                    <a href="#find-a-car">Check availability</a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Button onClick={resetFilters} type="button">
                Clear filters
              </Button>
            }
            className="mt-8"
            description="Try another car name or clear the selected vehicle type."
            icon={CarFront}
            title="No matching cars"
          />
        )}
      </div>
    </section>
  );
}
