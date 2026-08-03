import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import {
  ConditionReportView,
  getMyBookingConditionReport,
} from "@/features/inspections";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Condition report",
  description: "Pickup and return vehicle condition for your booking.",
};

export default async function CustomerConditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/login?next=/account");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect(`/login?next=/account/bookings/${id}/condition`);
  }

  const report = await getMyBookingConditionReport(id);
  if (!report) notFound();

  const vehicleLabel =
    report.vehicle.name ||
    [report.vehicle.make, report.vehicle.model].filter(Boolean).join(" ") ||
    "Vehicle";

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
          <h1 className="text-2xl font-bold tracking-tight">Condition report</h1>
          <p className="mt-1 text-sm text-brand-100">
            Pickup and return checks for {report.rental.referenceNumber}.
          </p>
        </div>
      </div>
      <ConditionReportView
        inspections={report.inspections}
        referenceNumber={report.rental.referenceNumber}
        subtitle="Your booking vehicle condition"
        title="Condition report"
        vehicleLabel={vehicleLabel}
      />
    </main>
  );
}
