import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BookingSearch } from "@/components/landing/booking-search";
import { todayDateValue } from "@/components/landing/booking-search-schema";
import { CarIllustration } from "@/components/landing/car-illustration";
import { landingPolicies } from "@/components/landing/landing-policies";
import { landingSteps } from "@/components/landing/landing-steps";
import { SiteHeader } from "@/components/landing/site-header";
import { VehicleListing } from "@/components/landing/vehicle-listing";
import { Button } from "@/components/ui/button";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";

export const metadata: Metadata = {
  title: "Zeke Car Rentals | Car Rental in Cebu",
  description:
    "DTI-registered, Cebu-based car rentals with clear daily rates, live availability, and pickup at the airport, hotel, or city.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
  }>;
}) {
  const query = await searchParams;
  const today = todayDateValue();
  const start =
    query.start?.trim() && query.start.trim() >= today
      ? query.start.trim()
      : undefined;
  const end =
    query.end?.trim() && (!start || query.end.trim() >= start)
      ? query.end.trim()
      : undefined;
  const trip = {
    pickup: query.pickup?.trim() || undefined,
    start,
    end,
  };
  const availableVehicles = await listPublicAvailableVehicles({
    startDate: trip.start,
    endDate: trip.end,
  });
  const signedIn = await isBookingUserSignedIn();
  const bookingParams = new URLSearchParams();
  if (trip.pickup) bookingParams.set("pickup", trip.pickup);
  if (trip.start) bookingParams.set("start", trip.start);
  if (trip.end) bookingParams.set("end", trip.end);
  if (query.mode) bookingParams.set("mode", query.mode);
  const bookingQuery = bookingParams.toString() || undefined;

  return (
    <main className="overflow-hidden bg-background" id="main-content">
      <section className="relative min-h-[640px] bg-brand-950 text-white">
        <div className="hero-road-grid absolute inset-0 opacity-35" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] bg-[radial-gradient(ellipse_at_70%_40%,rgba(45,212,191,0.14),transparent_55%)] lg:block"
        />
        <SiteHeader />

        <div className="relative mx-auto grid max-w-7xl items-end gap-10 px-4 pt-14 pb-40 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:px-8 lg:pt-20 lg:pb-44">
          <div className="page-enter relative z-10 max-w-2xl">
            <p className="text-sm font-bold tracking-[0.2em] text-teal-300 uppercase">
              Cebu car rental
            </p>
            <h1 className="mt-5 text-4xl leading-[1.02] font-bold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
              Zeke Car Rentals
              <span className="mt-2 block text-teal-400">
                Clear rates. Ready cars. Local trust.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-brand-100">
              DTI-registered and based in Cebu — self-drive or with driver,
              with pickup at the airport, hotel, or city location that fits your
              schedule.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#find-a-car">
                  Find a car
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button
                asChild
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                size="lg"
                variant="outline"
              >
                <a href="#fleet">Browse the fleet</a>
              </Button>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="relative hidden min-h-[360px] items-end justify-center lg:flex"
          >
            <CarIllustration
              className="relative z-10 w-full max-w-xl text-teal-500"
              variant="suv"
            />
          </div>
        </div>
      </section>

      <div className="relative z-20 mx-auto -mt-28 max-w-7xl px-4 sm:px-6 lg:px-8">
        <BookingSearch
          initialEnd={trip.end}
          initialMode={query.mode}
          initialPickup={trip.pickup}
          initialStart={trip.start}
          key={[trip.pickup, trip.start, trip.end, query.mode].join("|")}
        />
      </div>

      <VehicleListing
        bookingQuery={bookingQuery}
        signedIn={signedIn}
        trip={trip}
        vehicles={availableVehicles}
      />

      <section className="border-y border-border bg-card py-20 sm:py-24" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
              Simple from start to finish
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Your next drive in three steps
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              After you confirm, we share pickup details and stay reachable if
              your schedule shifts.
            </p>
          </div>

          <ol className="mt-12 grid list-none gap-8 md:grid-cols-3 md:gap-6">
            {landingSteps.map(({ icon: Icon, number, title, description }) => (
              <li key={number}>
                <article className="relative">
                  <span className="font-mono text-sm font-semibold text-gold-700">
                    {number}
                  </span>
                  <div className="mt-4 flex size-12 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon aria-hidden="true" className="size-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-brand-950">{title}</h3>
                  <p className="mt-2 leading-6 text-muted-foreground">{description}</p>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="rates-title"
        className="py-20 sm:py-24"
        id="rates"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
              Rates & policies
            </p>
            <h2
              className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl"
              id="rates-title"
            >
              Know the terms before you commit
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              We confirm the day rate and any deposit when you book — so you can
              compare options without guessing.
            </p>
          </div>

          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-bold text-brand-950">What’s included</h3>
              <ul className="mt-4 space-y-3 text-muted-foreground">
                {landingPolicies.included.map((item) => (
                  <li className="flex gap-3" key={item}>
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600"
                    />
                    <span className="leading-6">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold text-brand-950">Before you go</h3>
              <ul className="mt-4 space-y-3 text-muted-foreground">
                {landingPolicies.beforeYouGo.map((item) => (
                  <li className="flex gap-3" key={item}>
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-600"
                    />
                    <span className="leading-6">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-900 py-16 text-white" id="support">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-400 uppercase">
              Need help choosing?
            </p>
            <h2 className="mt-2 text-3xl font-bold">Tell us about your trip.</h2>
            <p className="mt-3 max-w-xl text-brand-100">
              Planning a Cebu trip? Check availability for your dates — we will
              match you with the right car for solo travel, family trips, or a
              full team.
            </p>
          </div>
          <Button asChild className="shrink-0" size="lg">
            <a href="#find-a-car">Check availability</a>
          </Button>
        </div>
      </section>

      <footer className="bg-brand-950 py-8 text-sm text-brand-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 Zeke Car Rentals. DTI registered · Based in Cebu.</p>
          <div className="flex flex-wrap gap-6">
            <a className="hover:text-white" href="#fleet">
              Our cars
            </a>
            <a className="hover:text-white" href="#how-it-works">
              How it works
            </a>
            <a className="hover:text-white" href="#rates">
              Rates
            </a>
            <a className="hover:text-white" href="#support">
              Support
            </a>
            <Link className="hover:text-white" href="/login">
              Staff portal
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
