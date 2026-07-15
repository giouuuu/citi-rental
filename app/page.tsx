import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Headphones,
  KeyRound,
  Search,
  ShieldCheck,
} from "lucide-react";

import { BookingSearch } from "@/components/landing/booking-search";
import { CarIllustration } from "@/components/landing/car-illustration";
import { SiteHeader } from "@/components/landing/site-header";
import { VehicleListing } from "@/components/landing/vehicle-listing";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Car Rental in Manila",
  description:
    "Find dependable self-drive and chauffeured car rentals with clear daily rates and 24/7 support.",
};

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Choose your car",
    description: "Compare the right size, features, and rate for your trip.",
  },
  {
    icon: BadgeCheck,
    number: "02",
    title: "Confirm your booking",
    description: "Share your schedule and we will confirm availability quickly.",
  },
  {
    icon: KeyRound,
    number: "03",
    title: "Pick up and drive",
    description: "Collect a clean, inspected car and start your journey.",
  },
];

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-background" id="main-content">
      <section className="relative min-h-[720px] bg-brand-950 text-white">
        <div className="hero-road-grid absolute inset-0 opacity-35" />
        <div className="absolute top-24 -right-36 size-[32rem] rounded-full border border-teal-400/20" />
        <div className="absolute top-36 -right-20 size-[24rem] rounded-full border border-teal-400/15" />
        <SiteHeader />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-16 pb-48 sm:px-6 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:pt-24 lg:pb-56">
          <div className="page-enter relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-teal-100 uppercase">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Trusted local car rental
            </div>
            <h1 className="mt-7 text-5xl leading-[0.96] font-bold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
              Find your car.
              <span className="mt-2 block text-teal-400">Own the journey.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-brand-100 sm:text-xl">
              Reliable cars, clear pricing, and flexible options for every city
              drive, airport run, and weekend escape.
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

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-brand-100">
              <span className="flex items-center gap-2">
                <Clock3 aria-hidden="true" className="size-4 text-gold-500" />
                Fast confirmation
              </span>
              <span className="flex items-center gap-2">
                <Headphones
                  aria-hidden="true"
                  className="size-4 text-gold-500"
                />
                24/7 trip support
              </span>
            </div>
          </div>

          <div className="relative hidden min-h-[390px] items-center lg:flex">
            <div className="absolute top-10 right-0 rounded-xl border border-white/15 bg-white/10 p-4 shadow-lg backdrop-blur-sm">
              <p className="text-xs tracking-wider text-brand-100 uppercase">
                Cars ready today
              </p>
              <p className="mt-1 text-3xl font-bold text-white">18</p>
            </div>
            <CarIllustration className="relative z-10 text-teal-500 drop-shadow-2xl" variant="suv" />
            <div className="absolute right-10 bottom-8 rounded-xl bg-gold-500 px-5 py-4 text-brand-950 shadow-lg">
              <p className="text-xs font-semibold tracking-wider uppercase">
                Daily rates from
              </p>
              <p className="mt-1 text-2xl font-black">₱1,700</p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-20 mx-auto -mt-36 max-w-7xl px-4 sm:px-6 lg:px-8">
        <BookingSearch />
      </div>

      <VehicleListing />

      <section
        className="border-y border-border bg-card py-20 sm:py-24"
        id="how-it-works"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
              Simple from start to finish
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Your next drive in three steps
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <article
                className="relative rounded-xl border border-border bg-background p-6"
                key={number}
              >
                <span className="absolute top-5 right-5 font-mono text-sm font-semibold text-gold-700">
                  {number}
                </span>
                <div className="flex size-12 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon aria-hidden="true" className="size-6" />
                </div>
                <h3 className="mt-6 text-lg font-bold text-brand-950">
                  {title}
                </h3>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-900 py-16 text-white" id="support">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-teal-400 uppercase">
              Need help choosing?
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              Tell us about your trip.
            </h2>
            <p className="mt-3 max-w-xl text-brand-100">
              We will match you with the right car, whether you are traveling
              solo, with family, or with a full team.
            </p>
          </div>
          <Button asChild className="shrink-0" size="lg">
            <a href="#find-a-car">Check availability</a>
          </Button>
        </div>
      </section>

      <footer className="bg-brand-950 py-8 text-sm text-brand-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 City Rentals. Drive with confidence.</p>
          <div className="flex gap-6">
            <a className="hover:text-white" href="#fleet">
              Our cars
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
