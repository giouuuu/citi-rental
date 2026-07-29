import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import { AccountBookingSection } from "@/features/booking/components/account-booking-section";
import { AccountProfileSummary } from "@/features/booking/components/account-profile-summary";
import { listMyBookings } from "@/features/booking/services/list-my-bookings";
import { isAwaitingPayment, isCurrentBookingStatus } from "@/features/booking/types/customer-booking";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Zeke Car Rentals account, current bookings, and history.",
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?next=/account");
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/login?next=/account");
  }

  const [{ data: userData }, { data: profile }, bookings] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .maybeSingle(),
    listMyBookings(),
  ]);

  const user = userData.user;
  if (!user) {
    redirect("/login?next=/account");
  }

  const meta = user.user_metadata ?? {};
  const fullName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email?.split("@")[0] ||
    "Account";
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    undefined;
  const initials = initialsFromName(fullName);

  const awaitingPayment = bookings.filter(isAwaitingPayment);
  const currentBookings = bookings.filter(
    (booking) =>
      isCurrentBookingStatus(booking.status) && !isAwaitingPayment(booking),
  );
  const historyBookings = bookings.filter(
    (booking) =>
      !isCurrentBookingStatus(booking.status) && !isAwaitingPayment(booking),
  );

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
            Your account
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Account</h1>
          <p className="mt-2 text-sm text-brand-100">
            Profile details, current reservations, and past trips.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <AccountProfileSummary
          avatarUrl={avatarUrl}
          email={user.email}
          fullName={fullName}
          initials={initials}
          role={profile?.role}
        />

        <AccountBookingSection
          bookings={awaitingPayment}
          description="Draft bookings waiting for your deposit payment or staff confirmation."
          emptyDescription="New bookings that need a deposit will appear here."
          emptyTitle="No payments pending"
          id="awaiting-payment"
          showBrowseCta
          title="Awaiting payment"
        />

        <AccountBookingSection
          bookings={currentBookings}
          description="Reservations and trips that are reserved, active, or overdue."
          emptyDescription="When you reserve a car with this account email, it will show up here."
          emptyTitle="No current bookings"
          id="current-bookings"
          showBrowseCta
          title="Current bookings"
        />

        <AccountBookingSection
          bookings={historyBookings}
          description="Completed and cancelled bookings linked to this account."
          emptyDescription="Finished trips will appear here after staff complete or cancel them."
          emptyTitle="No booking history yet"
          id="booking-history"
          title="Booking history"
        />

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost">
            <Link href="/#fleet">
              <ArrowLeft /> Back to fleet
            </Link>
          </Button>
          <form action={logoutAction}>
            <input name="next" type="hidden" value="/" />
            <Button type="submit" variant="outline">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
