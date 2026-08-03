import { notFound } from "next/navigation";

import { ConditionReportView } from "@/features/inspections";
import { listRentalInspections } from "@/features/inspections";
import { PrintReportButton } from "@/features/inspections/components/print-report-button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function InspectionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const [{ data: rental }, inspections] = await Promise.all([
    supabase
      .from("rentals")
      .select(
        `
        reference_number,
        vehicles ( name, make, model, plate_number )
      `,
      )
      .eq("id", id)
      .maybeSingle(),
    listRentalInspections(id),
  ]);

  if (!rental) notFound();

  const vehicle = Array.isArray(rental.vehicles)
    ? rental.vehicles[0]
    : rental.vehicles;
  let vehicleLabel = "Vehicle";
  if (vehicle && typeof vehicle === "object") {
    const name =
      "name" in vehicle && typeof vehicle.name === "string" ? vehicle.name : "";
    const make =
      "make" in vehicle && typeof vehicle.make === "string" ? vehicle.make : "";
    const model =
      "model" in vehicle && typeof vehicle.model === "string"
        ? vehicle.model
        : "";
    vehicleLabel = name || [make, model].filter(Boolean).join(" ") || "Vehicle";
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl justify-end p-4 print:hidden">
        <PrintReportButton />
      </div>
      <ConditionReportView
        inspections={inspections}
        referenceNumber={String(rental.reference_number ?? id)}
        showCharges
        subtitle="Ops printable condition report"
        title="Vehicle condition report"
        vehicleLabel={vehicleLabel}
      />
    </main>
  );
}
