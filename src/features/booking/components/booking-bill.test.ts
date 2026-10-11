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

  it("bills the days with the booking fees inside, and a delivery each way", () => {
    const bill = bookingBill({
      ...base,
      pickupMethod: "within_city",
      returnMethod: "within_city",
      bookingFees: [{ name: "Car wash", amount: 250 }],
    });
    expect(bill?.lines.map((line) => [line.key, line.amount])).toEqual([
      ["rent", 7150],
      ["pickup", 300],
      ["return", 300],
    ]);
    expect(bill?.lines[0]?.label).toBe("Car rental · 3 days");
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
      withDriver: { dailyRate: 1000, hoursPerDay: 10, overtimeRate: null },
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

  it("bills the Vios with a driver as rent with the wash, plus the driver's 10 hours", () => {
    const bill = bookingBill({
      ...base,
      dailyRate: 1500,
      end: "2026-10-14T19:00",
      withDriver: { dailyRate: 1500, hoursPerDay: 10, overtimeRate: 250 },
      bookingFees: [{ name: "Car wash", amount: 300 }],
    });
    expect(
      bill?.lines.map((line) => [line.label, line.detail, line.amountText ?? line.amount]),
    ).toEqual([
      ["Car rental · 1 day", undefined, 1800],
      ["Driver (1 day)", "₱1,500 a day, for up to 10 hours of driving each day", 1500],
      [
        "Extra driving hours",
        "Only if the driver drives more than 10 hours in one day. This is not in your total. You pay it when you return the car.",
        "₱250 / hour",
      ],
    ]);
    expect(bill?.quote.total).toBe(3300);
  });

  it("shows a driver with no rate as staff-quoted, outside the total", () => {
    const bill = bookingBill({
      ...base,
      withDriver: { dailyRate: null, hoursPerDay: 10, overtimeRate: null },
    });
    const driver = bill?.lines.find((line) => line.key === "driver");
    expect(driver?.amount).toBeNull();
    expect(bill?.quote.total).toBe(6900);
  });
});
