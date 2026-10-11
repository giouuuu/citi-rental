import { describe, expect, it } from "vitest";

import { type BookingBillInput, bookingBill } from "./booking-bill";

const base: BookingBillInput = {
  dailyRate: 2300,
  start: "2026-10-14T09:00",
  end: "2026-10-17T09:00",
  withDriver: null,
  pickupMethod: null,
  returnMethod: null,
  deliveryFees: { withinCity: 300, outsideCity: 400 },
  bookingFees: [],
  reservationFee: 500,
};

describe("bookingBill", () => {
  it("waits for both dates", () => {
    expect(bookingBill({ ...base, end: "" })).toBeNull();
  });

  it("bills the days, a delivery each way and the booking fees", () => {
    const bill = bookingBill({
      ...base,
      pickupMethod: "within_city",
      returnMethod: "within_city",
      bookingFees: [{ name: "Car wash", amount: 250 }],
    });
    expect(bill?.lines.map((line) => [line.key, line.amount])).toEqual([
      ["rent", 6900],
      ["pickup", 300],
      ["return", 300],
      ["fee-Car wash", 250],
    ]);
    expect(bill?.quote.total).toBe(7750);
    expect(bill?.deposit).toBe(500);
  });

  it("leaves the office out of the lines", () => {
    const bill = bookingBill({
      ...base,
      pickupMethod: "office",
      returnMethod: "outside_city",
    });
    expect(bill?.lines.map((line) => line.key)).toEqual(["rent", "return"]);
    expect(bill?.quote.total).toBe(7300);
  });

  it("waives delivery and collection with a driver", () => {
    const bill = bookingBill({
      ...base,
      withDriver: { rate: 1000 },
      pickupMethod: "within_city",
      returnMethod: "outside_city",
    });
    expect(bill?.lines.map((line) => [line.key, line.amount])).toEqual([
      ["rent", 6900],
      ["driver", 3000],
      ["pickup", 0],
      ["return", 0],
    ]);
    expect(bill?.lines.find((line) => line.key === "pickup")?.detail).toBe(
      "Within Cebu City · free with driver",
    );
    expect(bill?.quote.total).toBe(9900);
  });

  it("shows a driver with no rate as staff-quoted, outside the total", () => {
    const bill = bookingBill({ ...base, withDriver: { rate: null } });
    const driver = bill?.lines.find((line) => line.key === "driver");
    expect(driver?.amount).toBeNull();
    expect(bill?.quote.total).toBe(6900);
  });
});
