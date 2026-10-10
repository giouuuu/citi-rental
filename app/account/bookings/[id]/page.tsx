import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import { AccountBookingDetail } from "@/features/booking/components/account-booking-detail";
import { getMyBooking } from "@/features/booking/services/get-my-booking";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Booking details",
  description: "Your trip, bill, payments and review for one booking.",
};

export default async function AccountBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/login?next=/account");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect(`/login?next=/account/bookings/${id}`);
  }

  // get_my_booking returns nothing for a booking this account does not own.
  const booking = /^[0-9a-f-]{36}$/i.test(id) ? await getMyBooking(id) : null;
  if (!booking) notFound();

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Button asChild className="mb-4" size="sm" variant="secondary">
            <Link href="/account">
              <ArrowLeft /> Back to account
            </Link>
          </Button>
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
            Booking {booking.referenceNumber}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{booking.vehicle.name}</h1>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <AccountBookingDetail booking={booking} />
      </div>
    </main>
  );
}
