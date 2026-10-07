import { describe, expect, it } from "vitest";

import type { DashboardRental, DashboardVehicle } from "@/features/dashboard/types/dashboard";

import { buildDashboardSnapshot, hoursLate, lateness } from "./build-dashboard-snapshot";

// 2026-09-29 10:00 in Manila.
const NOW = new Date("2026-09-29T02:00:00Z");

function rental(id: string, overrides: Partial<DashboardRental>): DashboardRental {
  return {
    id,
    reference: id.toUpperCase(),
    customerName: "Mika Santos",
    customerPhone: "+63 917 555 0184",
    vehicleId: "car-out",
    vehiclePlate: "NCR 1842",
    vehicleName: "Toyota Vios",
    status: "active",
    source: "ops",
    paymentStatus: "deposit_paid",
    startAt: "2026-09-27T01:00:00Z",
    expectedReturnAt: "2026-10-02T01:00:00Z",
    createdAt: "2026-09-20T01:00:00Z",
    pickupLocation: "Mactan Airport",
    returnLocation: null,
    balance: 0,
    ...overrides,
  };
}

const vehicle = (id: string, status = "available"): DashboardVehicle => ({
  id,
  plateNumber: id.toUpperCase(),
  name: "Car",
  status,
});

describe("buildDashboardSnapshot", () => {
  const snapshot = buildDashboardSnapshot({
    now: NOW,
    vehicles: [
      vehicle("car-out"),
      vehicle("car-late"),
      vehicle("car-free"),
      vehicle("car-shop", "maintenance"),
      vehicle("car-retired", "inactive"),
    ],
    returnedToday: 2,
    collectedToday: 4500,
    rentals: [
      rental("due-late-tonight", { expectedReturnAt: "2026-09-29T15:30:00Z", balance: 1200 }), // 23:30 Manila
      rental("due-tomorrow-utc-today", { expectedReturnAt: "2026-09-29T16:30:00Z" }), // 00:30 tomorrow Manila
      rental("overdue", {
        vehicleId: "car-late",
        status: "overdue",
        expectedReturnAt: "2026-09-28T02:00:00Z",
        balance: 800,
      }),
      rental("released-this-morning", { startAt: "2026-09-29T00:30:00Z" }),
      rental("pickup-missed", { status: "reserved", vehicleId: "car-free", startAt: "2026-09-29T01:00:00Z" }),
      rental("pickup-today", { status: "reserved", vehicleId: "car-free", startAt: "2026-09-29T08:00:00Z" }),
      rental("pickup-tomorrow", { status: "reserved", startAt: "2026-09-30T02:00:00Z" }),
      rental("pickup-in-9-days", { status: "reserved", startAt: "2026-10-08T02:00:00Z" }),
      rental("draft", { status: "draft", paymentStatus: "unpaid", createdAt: "2026-09-29T01:00:00Z" }),
      rental("proof", { status: "draft", paymentStatus: "proof_submitted" }),
    ],
  });

  it("counts the operational fleet, excluding inactive cars", () => {
    expect(snapshot.fleet).toEqual({ total: 4, available: 3, maintenance: 1 });
    expect(snapshot.vehicles.map((v) => v.id)).not.toContain("car-retired");
  });

  it("uses Manila day boundaries for returns due today", () => {
    expect(snapshot.dueBackToday.map((r) => r.id)).toEqual(["due-late-tonight"]);
  });

  it("puts overdue returns and missed pickups on top of today's handovers", () => {
    expect(snapshot.handoversToday.map((h) => [h.kind, h.rental.id])).toEqual([
      ["overdue", "overdue"],
      ["late_pickup", "pickup-missed"],
      ["release", "pickup-today"],
      ["return", "due-late-tonight"],
    ]);
    expect(snapshot.handoversToday[0].lateHours).toBe(24);
    expect(snapshot.handoversToday[1].lateHours).toBe(1);
  });

  it("lists tomorrow's handovers by Manila day", () => {
    expect(snapshot.handoversTomorrow.map((h) => [h.kind, h.rental.id])).toEqual([
      ["return", "due-tomorrow-utc-today"],
      ["release", "pickup-tomorrow"],
    ]);
  });

  it("separates deposit proofs to check from bookings still awaiting a deposit", () => {
    expect(snapshot.proofsToVerify.map((r) => r.id)).toEqual(["proof"]);
    expect(snapshot.awaitingDeposit.map((r) => r.id)).toEqual(["draft"]);
  });

  it("reports today's progress and money", () => {
    expect(snapshot.onRentNow).toBe(4);
    expect(snapshot.releasedToday).toBe(1);
    expect(snapshot.returnedToday).toBe(2);
    expect(snapshot.collectedToday).toBe(4500);
    expect(snapshot.toCollectToday).toBe(2000);
  });

  it("shows each car's state with free cars first", () => {
    expect(snapshot.fleetBoard.map((car) => [car.vehicle.id, car.state])).toEqual([
      ["car-free", "free"],
      ["car-out", "out"],
      ["car-late", "overdue"],
      ["car-shop", "maintenance"],
    ]);
    expect(snapshot.fleetBoard[0].next?.id).toBe("pickup-missed");
    expect(snapshot.freeNow).toBe(1);
  });

  it("reports whole hours late", () => {
    expect(hoursLate({ expectedReturnAt: "2026-09-28T02:00:00Z" }, NOW)).toBe(24);
    expect(lateness(5)).toBe("5 hours late");
    expect(lateness(49)).toBe("2 days late");
  });
});
