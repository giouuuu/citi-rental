import { isDamageStatus } from "./checklist-areas";
import type {
  ConditionDelta,
  RentalInspection,
} from "../types/inspection";

export function compareInspections(
  pickup: RentalInspection | null | undefined,
  ret: RentalInspection | null | undefined,
): ConditionDelta[] {
  if (!ret) return [];

  const pickupByArea = new Map(
    (pickup?.items ?? []).map((item) => [item.areaCode, item]),
  );

  return ret.items.map((item) => {
    const prior = pickupByArea.get(item.areaCode);
    const pickupStatus = prior?.status ?? null;
    const pickupSeverity = prior?.severity ?? null;
    const isNewDamage =
      isDamageStatus(item.status) &&
      (pickupStatus == null ||
        pickupStatus === "ok" ||
        pickupStatus !== item.status ||
        (pickupSeverity != null &&
          item.severity != null &&
          item.severity > pickupSeverity));

    return {
      areaCode: item.areaCode,
      label: item.label,
      pickupStatus,
      returnStatus: item.status,
      pickupSeverity,
      returnSeverity: item.severity,
      isNewDamage,
    };
  });
}

export function summarizeInspectionDelta(deltas: ConditionDelta[]) {
  const newDamage = deltas.filter((delta) => delta.isNewDamage);
  const unchangedIssues = deltas.filter(
    (delta) =>
      !delta.isNewDamage &&
      delta.returnStatus != null &&
      isDamageStatus(delta.returnStatus),
  );
  return { newDamage, unchangedIssues };
}
