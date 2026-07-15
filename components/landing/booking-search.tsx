"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function BookingSearch() {
  const [mode, setMode] = useState("self-drive");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("fleet")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section
      aria-labelledby="find-a-car-title"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      id="find-a-car"
    >
      <div className="flex flex-col border-b border-border lg:flex-row lg:items-center lg:justify-between">
        <div className="bg-gold-500 px-6 py-4 text-brand-950 lg:min-w-80 lg:[clip-path:polygon(0_0,calc(100%-22px)_0,100%_50%,calc(100%-22px)_100%,0_100%)]">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase">
            Start your trip
          </p>
          <h2 id="find-a-car-title" className="mt-0.5 text-lg font-bold">
            Find your perfect car
          </h2>
        </div>

        <Tabs
          className="w-full px-5 py-4 lg:w-80 lg:px-6"
          onValueChange={setMode}
          value={mode}
        >
          <TabsList className="h-11! w-full rounded-lg bg-muted p-1">
            <TabsTrigger className="h-full" value="self-drive">
              Self-drive
            </TabsTrigger>
            <TabsTrigger className="h-full" value="with-driver">
              With driver
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <form className="p-5 sm:p-6 lg:p-8" onSubmit={handleSubmit}>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="pickup-location">Pick-up location</Label>
            <div className="relative">
              <MapPin
                aria-hidden="true"
                className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-teal-600"
              />
              <Input
                className="h-12 pl-10"
                id="pickup-location"
                name="pickup-location"
                placeholder="Airport, city, or hotel"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pickup-date">Pick-up date</Label>
            <div className="relative">
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-teal-600"
              />
              <Input
                className="h-12 pl-10"
                id="pickup-date"
                name="pickup-date"
                required
                type="date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="return-date">Return date</Label>
            <div className="relative">
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-teal-600"
              />
              <Input
                className="h-12 pl-10"
                id="return-date"
                name="return-date"
                required
                type="date"
              />
            </div>
          </div>

          <Button className="h-12 px-6" size="lg" type="submit">
            Show available cars
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5 text-sm text-muted-foreground">
          {["No hidden fees", "24/7 roadside support", "Flexible booking"].map(
            (benefit) => (
              <span className="flex items-center gap-2" key={benefit}>
                <CheckCircle2
                  aria-hidden="true"
                  className="size-4 text-success"
                />
                {benefit}
              </span>
            ),
          )}
        </div>
      </form>
    </section>
  );
}
