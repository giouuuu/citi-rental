import { describe, expect, it } from "vitest";
import { compareInspections } from "./compare-inspections";
import type { RentalInspection } from "../types/inspection";

function baseInspection(
  type: "pickup" | "return",
  items: RentalInspection["items"],
): RentalInspection {
  return {
    id: type,
    rentalId: "r1",
    inspectionType: type,
    templateId: null,
    odometer: type === "pickup" ? 1000 : 1100,
    fuelLevel: type === "pickup" ? 100 : 50,
    cleanliness: "clean",
    odor: "none",
    notes: null,
    fuelChargeAmount: null,
    fuelChargeNote: null,
    damageChargeAmount: null,
    damageChargeNote: null,
    customerSignaturePath: null,
    customerAcknowledgedAt: null,
    inspectedBy: null,
    inspectedAt: new Date().toISOString(),
    items,
    photos: [],
  };
}

describe("compareInspections", () => {
  it("flags new damage when return is worse than pickup", () => {
    const pickup = baseInspection("pickup", [
      {
        id: "1",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "ok",
        severity: null,
        notes: null,
      },
    ]);
    const ret = baseInspection("return", [
      {
        id: "2",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "scratch",
        severity: 2,
        notes: "new",
      },
    ]);

    const deltas = compareInspections(pickup, ret);
    expect(deltas[0]?.isNewDamage).toBe(true);
  });

  it("does not flag pre-existing matching damage as new", () => {
    const pickup = baseInspection("pickup", [
      {
        id: "1",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "scratch",
        severity: 2,
        notes: null,
      },
    ]);
    const ret = baseInspection("return", [
      {
        id: "2",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "scratch",
        severity: 2,
        notes: null,
      },
    ]);

    const deltas = compareInspections(pickup, ret);
    expect(deltas[0]?.isNewDamage).toBe(false);
  });

  it("flags severity increases as new damage", () => {
    const pickup = baseInspection("pickup", [
      {
        id: "1",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "scratch",
        severity: 1,
        notes: null,
      },
    ]);
    const ret = baseInspection("return", [
      {
        id: "2",
        areaCode: "hood",
        label: "Hood",
        itemGroup: "exterior",
        bodyMapZone: "hood",
        status: "scratch",
        severity: 4,
        notes: null,
      },
    ]);

    const deltas = compareInspections(pickup, ret);
    expect(deltas[0]?.isNewDamage).toBe(true);
  });
});
