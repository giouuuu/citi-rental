import {
  compareInspections,
  summarizeInspectionDelta,
} from "@/features/inspections/lib/compare-inspections";
import {
  REQUIRED_OVERVIEW_PHOTO_KINDS,
  statusLabel,
} from "@/features/inspections/lib/checklist-areas";
import { InspectionPhotoPair } from "@/features/inspections/components/inspection-photo-pair";
import type {
  InspectionPhoto,
  RentalInspection,
} from "@/features/inspections/types/inspection";

function photoByKind(
  photos: InspectionPhoto[],
  kind: string,
): InspectionPhoto | undefined {
  return photos.find((photo) => photo.kind === kind && photo.signedUrl);
}

function damagePhotoForArea(
  inspection: RentalInspection | null | undefined,
  areaCode: string,
): InspectionPhoto | undefined {
  if (!inspection) return undefined;
  const item = inspection.items.find((entry) => entry.areaCode === areaCode);
  if (!item) return undefined;
  return inspection.photos.find(
    (photo) =>
      photo.kind === "damage_closeup" &&
      photo.itemId === item.id &&
      photo.signedUrl,
  );
}

export function InspectionComparison({
  pickup,
  ret,
}: {
  pickup?: RentalInspection | null;
  ret?: RentalInspection | null;
}) {
  if (!pickup && !ret) {
    return (
      <p className="text-sm text-muted-foreground">
        No pickup or return inspections recorded yet.
      </p>
    );
  }

  const deltas = compareInspections(pickup, ret);
  const { newDamage, unchangedIssues } = summarizeInspectionDelta(deltas);
  const kmDriven =
    pickup && ret ? Math.max(0, ret.odometer - pickup.odometer) : null;
  const fuelDelta = pickup && ret ? ret.fuelLevel - pickup.fuelLevel : null;

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Km driven</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {kmDriven == null ? "—" : `${kmDriven.toLocaleString()} km`}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Fuel change</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {fuelDelta == null
              ? "—"
              : `${fuelDelta > 0 ? "+" : ""}${fuelDelta.toFixed(0)}%`}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">New damage items</dt>
          <dd className="text-lg font-semibold tabular-nums">{newDamage.length}</dd>
        </div>
      </dl>

      {pickup && ret ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Overview photo comparison</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {REQUIRED_OVERVIEW_PHOTO_KINDS.map((kind) => (
              <InspectionPhotoPair
                key={kind.value}
                after={photoByKind(ret.photos, kind.value)}
                before={photoByKind(pickup.photos, kind.value)}
                label={kind.label}
              />
            ))}
          </div>
        </div>
      ) : null}

      {newDamage.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">New damage at return</h3>
          <ul className="space-y-3 text-sm">
            {newDamage.map((delta) => (
              <li key={delta.areaCode} className="space-y-2">
                <p>
                  {delta.label}:{" "}
                  {delta.pickupStatus ? statusLabel(delta.pickupStatus) : "OK"} →{" "}
                  {delta.returnStatus ? statusLabel(delta.returnStatus) : "—"}
                </p>
                <InspectionPhotoPair
                  after={damagePhotoForArea(ret, delta.areaCode)}
                  before={damagePhotoForArea(pickup, delta.areaCode)}
                  label={`${delta.label} close-up`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unchangedIssues.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Pre-existing issues</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {unchangedIssues.map((delta) => (
              <li key={delta.areaCode}>
                {delta.label}:{" "}
                {delta.returnStatus ? statusLabel(delta.returnStatus) : "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ret?.fuelChargeAmount != null || ret?.damageChargeAmount != null ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <h3 className="mb-2 font-semibold">Charges / penalties</h3>
          {ret.fuelChargeAmount != null ? (
            <p>
              Fuel: ₱{Number(ret.fuelChargeAmount).toLocaleString()}
              {ret.fuelChargeNote ? ` — ${ret.fuelChargeNote}` : ""}
            </p>
          ) : null}
          {ret.damageChargeAmount != null ? (
            <p>
              Damage penalty: ₱{Number(ret.damageChargeAmount).toLocaleString()}
              {ret.damageChargeNote ? ` — ${ret.damageChargeNote}` : ""}
              {Number(ret.damageChargeAmount) > 0
                ? " (posted to payment ledger)"
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
