import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import { PastRentalForm } from "@/features/rentals/components/past-rental-form";
import type { PastRentalCar } from "@/features/rentals/lib/past-rental";
import { suggestRentalReference } from "@/features/rentals/lib/rental-reference";
import { DEMO_CUSTOMERS, DEMO_VEHICLES } from "@/features/shared/lib/demo-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Record past rental" };

type CustomerOption = { id: string; fullName: string; phoneNumber: string | null };

async function loadChoices(): Promise<{
  customers: CustomerOption[];
  cars: PastRentalCar[];
  driverDailyRate: number | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      customers: DEMO_CUSTOMERS.map((c) => ({ id: c.id, fullName: c.fullName, phoneNumber: c.phoneNumber })),
      cars: DEMO_VEHICLES.map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        name: v.name,
        dailyRate: v.dailyRate,
        halfDayRate: null,
        hourlyRate: null,
      })),
      driverDailyRate: 1000,
    };
  }
  const supabase = await createClient();
  const rate = (value: unknown) => (value == null ? null : Number(value));
  const [customers, vehicles, company] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone_number").order("full_name"),
    // Every car, retired ones too: history can be on a car no longer rented out.
    supabase
      .from("vehicles")
      .select("id, plate_number, name, daily_rate, half_day_rate, hourly_rate")
      .order("plate_number"),
    supabase.from("company_profile").select("driver_daily_rate").limit(1).maybeSingle(),
  ]);
  if (customers.error) throw customers.error;
  if (vehicles.error) throw vehicles.error;
  return {
    customers: (customers.data ?? []).map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phoneNumber: c.phone_number,
    })),
    cars: (vehicles.data ?? []).map((v) => ({
      id: v.id,
      plateNumber: v.plate_number,
      name: v.name,
      dailyRate: rate(v.daily_rate),
      halfDayRate: rate(v.half_day_rate),
      hourlyRate: rate(v.hourly_rate),
    })),
    driverDailyRate: rate(company.data?.driver_daily_rate),
  };
}

export default async function Page() {
  const choices = await loadChoices();
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Rentals", href: "/rentals" },
          { label: "Record past rental" },
        ]}
        description="Enter a rental that already happened. It is saved as completed with its real dates and payment — no inspections, and the customer gets no emails."
        title="Record past rental"
      />
      <Button asChild variant="ghost">
        <Link href="/rentals">
          <ArrowLeft /> Back to rentals
        </Link>
      </Button>
      <PastRentalForm
        cars={choices.cars}
        customers={choices.customers}
        defaultReference={suggestRentalReference()}
        driverDailyRate={choices.driverDailyRate}
      />
    </div>
  );
}
