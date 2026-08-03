import { statusLabel } from "@/features/inspections/lib/checklist-areas";
import {
  compareInspections,
  summarizeInspectionDelta,
} from "@/features/inspections/lib/compare-inspections";
import type { RentalInspection } from "@/features/inspections/types/inspection";

export function ConditionReportView({
  title,
  subtitle,
  referenceNumber,
  vehicleLabel,
  inspections,
  showCharges = false,
}: {
  title: string;
  subtitle?: string;
  referenceNumber: string;
  vehicleLabel: string;
  inspections: RentalInspection[];
  showCharges?: boolean;
}) {
  const pickup = inspections.find((row) => row.inspectionType === "pickup");
  const ret = inspections.find((row) => row.inspectionType === "return");
  const { newDamage } = summarizeInspectionDelta(
    compareInspections(pickup, ret),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 print:p-0">
      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
          Condition report
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        <p className="text-sm">
          {referenceNumber} · {vehicleLabel}
        </p>
      </header>

      {inspections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No inspections have been recorded for this booking yet.
        </p>
      ) : null}

      {inspections.map((inspection) => (
        <section key={inspection.id} className="space-y-2">
          <h2 className="text-lg font-semibold capitalize">
            {inspection.inspectionType}
          </h2>
          <p className="text-sm text-muted-foreground">
            {new Date(inspection.inspectedAt).toLocaleString("en-PH")} ·{" "}
            {inspection.odometer.toLocaleString()} km · {inspection.fuelLevel}% fuel ·{" "}
            {inspection.cleanliness.replaceAll("_", " ")}
          </p>
          <ul className="space-y-1 text-sm">
            {inspection.items
              .filter((item) => item.status !== "ok")
              .map((item) => (
                <li key={item.id}>
                  {item.label}: {statusLabel(item.status)}
                  {item.notes ? ` — ${item.notes}` : ""}
                </li>
              ))}
          </ul>
          {inspection.items.every((item) => item.status === "ok") ? (
            <p className="text-sm text-muted-foreground">All checklist items OK.</p>
          ) : null}
        </section>
      ))}

      {newDamage.length > 0 ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">New damage at return</h2>
          <ul className="space-y-1 text-sm">
            {newDamage.map((delta) => (
              <li key={delta.areaCode}>
                {delta.label}:{" "}
                {delta.returnStatus ? statusLabel(delta.returnStatus) : "—"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showCharges && ret ? (
        <section className="text-sm">
          <h2 className="mb-2 text-lg font-semibold">Charges / penalties</h2>
          <p>
            Fuel:{" "}
            {ret.fuelChargeAmount != null
              ? `₱${Number(ret.fuelChargeAmount).toLocaleString()}`
              : "—"}
            {ret.fuelChargeNote ? ` — ${ret.fuelChargeNote}` : ""}
          </p>
          <p>
            Damage penalty:{" "}
            {ret.damageChargeAmount != null
              ? `₱${Number(ret.damageChargeAmount).toLocaleString()}`
              : "—"}
            {ret.damageChargeNote ? ` — ${ret.damageChargeNote}` : ""}
            {ret.damageChargeAmount != null && Number(ret.damageChargeAmount) > 0
              ? " (recorded on payment ledger)"
              : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}
