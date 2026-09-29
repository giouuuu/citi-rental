import { describe, expect, it } from "vitest";

import type { DashboardRental } from "@/features/dashboard/types/dashboard";

import { buildDashboardSnapshot, hoursLate } from "./build-dashboard-snapshot";

// 2026-09-29 10:00 in Manila.
const NOW = new Date("2026-09-29T02:00:00Z");

function rental(id: string, overrides: Partial<DashboardRental>): DashboardRental {
  return {
    id,
    reference: id.toUpperCase(),
    customerName: "Mika Santos",
    vehiclePlate: "NCR 1842",
    vehicleName: "Toyota Vios",
    status: "active",
    source: "ops",
    startAt: "2026-09-27T01:00:00Z",
    expectedReturnAt: "2026-10-02T01:00:00Z",
    createdAt: "2026-09-20T01:00:00Z",
    ...overrides,
  };
}

describe("buildDashboardSnapshot", () => {
  const snapshot = buildDashboardSnapshot({
    now: NOW,
    vehicleStatuses: ["available", "available", "maintenance", "inactive"],
    rentals: [
      rental("due-late-tonight", { expectedReturnAt: "2026-09-29T15:30:00Z" }), // 23:30 Manila
      rental("due-tomorrow-utc-today", { expectedReturnAt: "2026-09-29T16:30:00Z" }), // 00:30 tomorrow Manila
      rental("overdue", { status: "overdue", expectedReturnAt: "2026-09-28T02:00:00Z" }),
      rental("pickup-today", { status: "reserved", startAt: "2026-09-29T08:00:00Z" }),
      rental("pickup-in-6-days", { status: "reserved", startAt: "2026-10-05T02:00:00Z" }),
      rental("pickup-in-9-days", { status: "reserved", startAt: "2026-10-08T02:00:00Z" }),
      rental("draft", { status: "draft", createdAt: "2026-09-29T01:00:00Z" }),
    ],
  });

  it("counts the operational fleet, excluding inactive cars", () => {
    expect(snapshot.fleet).toEqual({ total: 3, available: 2, maintenance: 1 });
  });

  it("uses Manila day boundaries for returns due today", () => {
    expect(snapshot.dueBackToday.map((r) => r.id)).toEqual(["due-late-tonight"]);
  });

  it("separates overdue, today's pickups, and the week ahead", () => {
    expect(snapshot.onRentNow).toBe(3);
    expect(snapshot.overdue.map((r) => r.id)).toEqual(["overdue"]);
    expect(snapshot.pickupsToday.map((r) => r.id)).toEqual(["pickup-today"]);
    expect(snapshot.upcomingPickups.map((r) => r.id)).toEqual(["pickup-in-6-days"]);
    expect(snapshot.awaitingDeposit.map((r) => r.id)).toEqual(["draft"]);
  });

  it("lists the newest bookings first", () => {
    expect(snapshot.recentBookings[0].id).toBe("draft");
  });

  it("reports whole hours late", () => {
    expect(hoursLate({ expectedReturnAt: "2026-09-28T02:00:00Z" }, NOW)).toBe(24);
  });
});
