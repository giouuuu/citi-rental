import { describe, expect, it } from "vitest";

import { EMPTY_PAST_RENTAL, planPastRental, type PastRentalInput } from "./past-rental";

const NOW = new Date("2026-10-11T04:00:00Z"); // Oct 11, noon Manila
const car = {
  id: "car-1",
  plateNumber: "ABC 123",
  name: "Vios",
  dailyRate: 1500,
  halfDayRate: 900,
  hourlyRate: 150,
};

function input(overrides: Partial<PastRentalInput> = {}): PastRentalInput {
  return {
    ...EMPTY_PAST_RENTAL,
    referenceNumber: "RNT-1",
    customerId: "cust-1",
    vehicleId: "car-1",
    startAt: "2026-09-05T09:00",
    expectedReturnAt: "2026-09-07T09:00",
    actualReturnAt: "2026-09-07T09:00",
    ...overrides,
  };
}

const plan = (overrides: Partial<PastRentalInput> = {}, driverDailyRate: number | null = 1000) =>
  planPastRental(input(overrides), { car, driverDailyRate, now: NOW });

describe("planPastRental", () => {
  it("prices the agreed time with the car's rates and dates it in Manila time", () => {
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.total).toBe(3000);
    expect(result.args.p_start_at).toBe("2026-09-05T01:00:00.000Z");
    expect(result.args.p_quoted_days).toBe(2);
    // No booking date: booked at pickup.
    expect(result.args.p_booked_at).toBe(result.args.p_start_at);
    expect(result.preview.lateHours).toBeNull();
  });

  it("adds the driver fee, and lets the owner type the total they charged", () => {
    const driver = plan({ withDriver: true });
    expect(driver.ok && driver.preview.total).toBe(5000);
    expect(driver.ok && driver.args.p_driver_fee).toBe(2000);

    const discounted = plan({ totalCharged: "2500" });
    expect(discounted.ok && discounted.preview.total).toBe(2500);
    expect(discounted.ok && discounted.preview.totalIsCustom).toBe(true);
    expect(discounted.ok && discounted.args.p_quoted_total).toBe(2500);
  });

  it("flags a late return past the 1-hour grace without re-pricing it", () => {
    const result = plan({ actualReturnAt: "2026-09-07T14:30" });
    expect(result.ok && result.preview.lateHours).toBe(5.5);
    expect(result.ok && result.preview.total).toBe(3000);
    const withinGrace = plan({ actualReturnAt: "2026-09-07T09:45" });
    expect(withinGrace.ok && withinGrace.preview.lateHours).toBeNull();
  });

  it("records the payment on the date it was paid and works out the balance", () => {
    const result = plan({ amountPaid: "1,000", paymentMethod: "gcash", paidAt: "2026-09-01T10:00" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.p_amount_paid).toBe(1000);
    expect(result.args.p_paid_at).toBe("2026-09-01T02:00:00.000Z");
    expect(result.preview.balance).toBe(2000);
  });

  it("refuses times that are not in the past or out of order", () => {
    const future = plan({ actualReturnAt: "2026-10-12T09:00" });
    expect(!future.ok && future.fieldErrors.actualReturnAt).toMatch(/already be back/);
    const backwards = plan({ expectedReturnAt: "2026-09-04T09:00" });
    expect(!backwards.ok && backwards.fieldErrors.expectedReturnAt).toMatch(/after the pickup/);
    const bookedLate = plan({ bookedAt: "2026-09-06T09:00" });
    expect(!bookedLate.ok && bookedLate.fieldErrors.bookedAt).toBeTruthy();
  });

  it("needs the payment date and refuses overpaying", () => {
    const noDate = plan({ amountPaid: "500" });
    expect(!noDate.ok && noDate.fieldErrors.paidAt).toBeTruthy();
    const over = plan({ amountPaid: "5000", paidAt: "2026-09-05T09:00" });
    expect(!over.ok && over.fieldErrors.amountPaid).toMatch(/More than/);
  });

  it("asks for a rate or a total when the car has none", () => {
    const result = planPastRental(input(), { car: { ...car, dailyRate: null }, driverDailyRate: null, now: NOW });
    expect(!result.ok && result.fieldErrors.dailyRate).toBeTruthy();
    const typed = planPastRental(input({ totalCharged: "4000" }), {
      car: { ...car, dailyRate: null },
      driverDailyRate: null,
      now: NOW,
    });
    expect(typed.ok && typed.preview.total).toBe(4000);
    expect(typed.ok && typed.args.p_quoted_daily_rate).toBeNull();
  });

  it("names every missing required field at once", () => {
    const result = planPastRental({ ...EMPTY_PAST_RENTAL }, { car: null, driverDailyRate: null, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(
      ["actualReturnAt", "customerId", "dailyRate", "expectedReturnAt", "referenceNumber", "startAt", "vehicleId"].sort(),
    );
  });
});
