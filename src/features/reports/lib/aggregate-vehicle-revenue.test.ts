import { describe, expect, it } from "vitest";

import {
  aggregateVehicleRevenue,
  rentedDaysInWindow,
  type RevenuePayment,
  type RevenueRental,
} from "./aggregate-vehicle-revenue";

const FROM = new Date("2026-08-01T00:00:00.000Z");
const TO = new Date("2026-08-31T00:00:00.000Z"); // 30-day window

function rental(overrides: Partial<RevenueRental> = {}): RevenueRental {
  return {
    id: "r1",
    vehicleId: "v1",
    vehicleName: "Vios",
    plateNumber: "ABC 123",
    startAt: "2026-08-01T00:00:00.000Z",
    expectedReturnAt: "2026-08-04T00:00:00.000Z",
    actualReturnAt: null,
    quotedTotal: 6000,
    ...overrides,
  };
}

describe("rentedDaysInWindow", () => {
  it("counts days fully inside the window", () => {
    expect(rentedDaysInWindow(rental(), FROM, TO)).toBe(3);
  });

  it("clamps a rental that started before the window", () => {
    expect(
      rentedDaysInWindow(
        rental({
          startAt: "2026-07-28T00:00:00.000Z",
          expectedReturnAt: "2026-08-03T00:00:00.000Z",
        }),
        FROM,
        TO,
      ),
    ).toBe(2);
  });

  it("clamps a rental that runs past the window", () => {
    expect(
      rentedDaysInWindow(
        rental({
          startAt: "2026-08-29T00:00:00.000Z",
          expectedReturnAt: "2026-09-10T00:00:00.000Z",
        }),
        FROM,
        TO,
      ),
    ).toBe(2);
  });

  it("returns 0 for a rental entirely outside the window", () => {
    expect(
      rentedDaysInWindow(
        rental({
          startAt: "2026-06-01T00:00:00.000Z",
          expectedReturnAt: "2026-06-05T00:00:00.000Z",
        }),
        FROM,
        TO,
      ),
    ).toBe(0);
  });

  it("prefers the actual return over the expected return", () => {
    expect(
      rentedDaysInWindow(
        rental({
          expectedReturnAt: "2026-08-10T00:00:00.000Z",
          actualReturnAt: "2026-08-03T00:00:00.000Z",
        }),
        FROM,
        TO,
      ),
    ).toBe(2);
  });
});

describe("aggregateVehicleRevenue", () => {
  it("sums rentals and payments per vehicle", () => {
    const payments: RevenuePayment[] = [
      { rentalId: "r1", paymentType: "deposit", amount: 2000 },
      { rentalId: "r1", paymentType: "balance", amount: 4000 },
    ];
    const [row] = aggregateVehicleRevenue({
      rentals: [rental()],
      payments,
      from: FROM,
      to: TO,
    });

    expect(row.rentalCount).toBe(1);
    expect(row.rentedDays).toBe(3);
    expect(row.collected).toBe(6000);
    expect(row.quotedTotal).toBe(6000);
    expect(row.outstanding).toBe(0);
  });

  it("adds penalties to what is owed without counting them as collected", () => {
    const [row] = aggregateVehicleRevenue({
      rentals: [rental()],
      payments: [
        { rentalId: "r1", paymentType: "balance", amount: 6000 },
        { rentalId: "r1", paymentType: "penalty", amount: 750 },
      ],
      from: FROM,
      to: TO,
    });

    expect(row.collected).toBe(6000);
    expect(row.penalties).toBe(750);
    expect(row.outstanding).toBe(750);
  });

  it("subtracts refunds from the collected total", () => {
    const [row] = aggregateVehicleRevenue({
      rentals: [rental()],
      payments: [
        { rentalId: "r1", paymentType: "balance", amount: 6000 },
        { rentalId: "r1", paymentType: "refund", amount: 1000 },
      ],
      from: FROM,
      to: TO,
    });

    expect(row.collected).toBe(5000);
    expect(row.outstanding).toBe(1000);
  });

  it("never reports negative outstanding for an overpaid rental", () => {
    const [row] = aggregateVehicleRevenue({
      rentals: [rental()],
      payments: [{ rentalId: "r1", paymentType: "balance", amount: 9000 }],
      from: FROM,
      to: TO,
    });

    expect(row.outstanding).toBe(0);
  });

  it("caps utilization at 100 percent", () => {
    const [row] = aggregateVehicleRevenue({
      rentals: [
        rental({
          id: "r1",
          startAt: "2026-08-01T00:00:00.000Z",
          expectedReturnAt: "2026-08-31T00:00:00.000Z",
        }),
        rental({
          id: "r2",
          startAt: "2026-08-01T00:00:00.000Z",
          expectedReturnAt: "2026-08-31T00:00:00.000Z",
        }),
      ],
      payments: [],
      from: FROM,
      to: TO,
    });

    expect(row.utilizationPercent).toBe(100);
  });

  it("groups separate vehicles into separate rows", () => {
    const rows = aggregateVehicleRevenue({
      rentals: [
        rental({ id: "r1", vehicleId: "v1", plateNumber: "AAA 111" }),
        rental({ id: "r2", vehicleId: "v2", plateNumber: "BBB 222" }),
      ],
      payments: [{ rentalId: "r2", paymentType: "balance", amount: 500 }],
      from: FROM,
      to: TO,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].plateNumber).toBe("BBB 222");
    expect(rows[0].collected).toBe(500);
  });

  it("omits a vehicle with no rentals in the window", () => {
    expect(
      aggregateVehicleRevenue({
        rentals: [],
        payments: [],
        from: FROM,
        to: TO,
      }),
    ).toEqual([]);
  });
});
