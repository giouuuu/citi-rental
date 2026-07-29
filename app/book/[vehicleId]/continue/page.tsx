import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { BookingContinueChoice } from "@/features/booking/components/booking-continue-choice";
import { bookingFormPath } from "@/features/booking/lib/booking-continue";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { getPublicVehicle } from "@/features/booking/services/public-booking-service";

type ContinuePageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Continue booking",
  description: "Sign in or continue as a guest to reserve your car.",
};

export default async function BookContinuePage({
  params,
  searchParams,
}: ContinuePageProps) {
  const { vehicleId } = await params;
  const query = await searchParams;
  const bookingQuery = {
    pickup: query.pickup,
    start: query.start,
    end: query.end,
  };

  if (await isBookingUserSignedIn()) {
    redirect(bookingFormPath(vehicleId, bookingQuery));
  }

  const vehicle = await getPublicVehicle(vehicleId);

  if (!vehicle) notFound();

  if (vehicle.status === "maintenance" || vehicle.status === "inactive") {
    return (
      <main className="min-h-screen bg-background" id="main-content">
        <div className="bg-brand-950 text-white">
          <SiteHeader />
        </div>
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <p className="text-sm text-warning">
            This car is not available for booking right now.{" "}
            <Link className="font-medium underline" href="/#fleet">
              Browse available cars
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
            Customer booking
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Almost ready to reserve
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <BookingContinueChoice
          query={bookingQuery}
          vehicleId={vehicleId}
          vehicleName={vehicle.name}
        />
      </div>
    </main>
  );
}
