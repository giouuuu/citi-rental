import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { BookingForm } from "@/features/booking/components/booking-form";
import { listPublicVehicleBookedRanges } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import { getPublicVehicle } from "@/features/booking/services/public-booking-service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type BookPageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Book a car",
  description: "Reserve an available fleet vehicle online.",
};

export default async function BookVehiclePage({
  params,
  searchParams,
}: BookPageProps) {
  const { vehicleId } = await params;
  const query = await searchParams;
  const vehicle = await getPublicVehicle(vehicleId);

  if (!vehicle) notFound();

  const bookedRanges = await listPublicVehicleBookedRanges(vehicleId);

  let initialFullName: string | undefined;
  let initialEmail: string | undefined;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const meta = user.user_metadata ?? {};
      const fromMeta =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        "";
      initialFullName = fromMeta || undefined;
      initialEmail = user.email ?? undefined;
    }
  }

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
            Customer booking
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Reserve {vehicle.name}
          </h1>
          <p className="mt-2 text-sm text-brand-100">
            Submit your trip details and we will hold the car as reserved for staff
            confirmation.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {vehicle.status === "maintenance" || vehicle.status === "inactive" ? (
          <div className="rounded-xl border border-warning/30 bg-warning-surface p-6 text-sm text-warning">
            This car is not available for booking right now.{" "}
            <Link className="font-medium underline" href="/#fleet">
              Browse available cars
            </Link>
            .
          </div>
        ) : (
          <BookingForm
            bookedRanges={bookedRanges}
            initialEmail={initialEmail}
            initialFullName={initialFullName}
            initialPickupLocation={query.pickup}
            initialReturnAt={query.end}
            initialStartAt={query.start}
            vehicle={vehicle}
          />
        )}
      </div>
    </main>
  );
}
