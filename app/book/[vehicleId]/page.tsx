import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { BookingHero } from "@/features/booking/components/booking-hero";
import { BookingWorkspace } from "@/features/booking/components/booking-workspace";
import { parseDrivingMode } from "@/features/booking/lib/driving-mode";
import { listPublicVehicleBookedRanges } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import {
  getPublicDriverDailyRate,
  getPublicFreeCancellationHours,
  getPublicReservationFee,
  getPublicVehicle,
} from "@/features/booking/services/public-booking-service";
import { OPEN_GRAPH_BASE } from "@/features/seo/lib/business";
import { vehicleSeoTitle } from "@/features/seo/lib/vehicle-title";
import { formatPhp } from "@/features/shared/lib/money";
import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type BookPageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
  }>;
};

export async function generateMetadata({
  params,
}: Pick<BookPageProps, "params">): Promise<Metadata> {
  const { vehicleId } = await params;
  const vehicle = await getPublicVehicle(vehicleId);
  if (!vehicle) return { title: "Car not found", robots: { index: false } };

  const title = `${vehicleSeoTitle(vehicle)} for Rent in Cebu – ${formatPhp(vehicle.daily_rate)}/day`;
  const specs = [
    vehicle.seating_capacity ? `${vehicle.seating_capacity} seats` : null,
    vehicle.transmission === "manual"
      ? "manual"
      : vehicle.transmission
        ? "automatic"
        : null,
    vehicle.fuel_type === "other" ? null : vehicle.fuel_type,
  ].filter(Boolean);
  const description = `${vehicleSeoTitle(vehicle)} for rent in Cebu at ${formatPhp(vehicle.daily_rate)} a day${specs.length ? ` (${specs.join(", ")})` : ""}. Self-drive or with driver, delivered anywhere in Cebu province. Check dates and book online.`;
  const listed =
    vehicle.status !== "maintenance" && vehicle.status !== "inactive";

  return {
    title,
    description,
    alternates: { canonical: `/book/${vehicle.id}` },
    // Off-fleet cars drop out of search until they are bookable again.
    robots: listed ? undefined : { index: false },
    openGraph: {
      ...OPEN_GRAPH_BASE,
      url: `/book/${vehicle.id}`,
      title,
      description,
    },
  };
}

export default async function BookVehiclePage({
  params,
  searchParams,
}: BookPageProps) {
  const { vehicleId } = await params;
  const query = await searchParams;
  const vehicle = await getPublicVehicle(vehicleId);

  if (!vehicle) notFound();

  const [
    bookedRanges,
    fleet,
    reservationFee,
    freeCancellationHours,
    driverDailyRate,
  ] = await Promise.all([
    listPublicVehicleBookedRanges(vehicleId),
    listPublicAvailableVehicles(),
    getPublicReservationFee(),
    getPublicFreeCancellationHours(),
    getPublicDriverDailyRate(),
  ]);
  const bookingQuery = {
    pickup: query.pickup,
    start: query.start,
    end: query.end,
    mode: query.mode,
  };

  let signedIn = false;
  let initialFullName: string | undefined;
  let initialEmail: string | undefined;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      signedIn = true;
      const meta = user.user_metadata ?? {};
      const fromMeta =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        "";
      initialFullName = fromMeta || undefined;
      initialEmail = user.email ?? undefined;
    }
  }

  if (vehicle.status === "maintenance" || vehicle.status === "inactive") {
    return (
      <main className="min-h-screen bg-background" id="main-content">
        <BookingHero header={<SiteHeader />} vehicleName={vehicle.name} />
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-warning/30 bg-warning-surface p-6 text-sm text-warning">
            This car is not available for booking right now.{" "}
            <Link className="font-medium underline" href="/#fleet">
              Browse available cars
            </Link>
            .
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <BookingWorkspace
        bookedRanges={bookedRanges}
        driverDailyRate={driverDailyRate}
        fleet={fleet}
        freeCancellationHours={freeCancellationHours}
        header={<SiteHeader />}
        initialDrivingMode={parseDrivingMode(query.mode)}
        initialEmail={initialEmail}
        initialFullName={initialFullName}
        initialPickupLocation={query.pickup}
        initialReturnAt={query.end}
        initialStartAt={query.start}
        query={bookingQuery}
        reservationFee={reservationFee}
        signedIn={signedIn}
        vehicle={
          fleet.find((car) => car.id === vehicle.id) ?? {
            ...vehicle,
            gallery: [],
          }
        }
      />
    </main>
  );
}
