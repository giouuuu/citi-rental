import { describe, expect, it } from "vitest";

import type { RentalPayment } from "@/features/rentals/types/rental-payment";

import {
  buildRentalBill,
  describeRentLine,
  rentalBillStatus,
} from "./rental-bill";

function entry(overrides: Partial<RentalPayment>): RentalPayment {
  return {
    id: crypto.randomUUID(),
    rentalId: "rental",
    paymentType: "balance",
    amount: 0,
    currency: "PHP",
    method: "cash",
    status: "confirmed",
    externalReference: null,
    proofPath: null,
    proofUrl: null,
    notes: null,
    submittedAt: "2026-10-09T00:00:00.000Z",
    confirmedAt: "2026-10-09T00:00:00.000Z",
    chargeTypeName: null,
    chargeTypeCode: null,
    ...overrides,
  };
}

describe("buildRentalBill", () => {
  it("shows a with-driver rental's driver apart from the rent", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 2,
      quotedTotal: 7000,
      driver: { fee: 2000, rate: 1000, days: 2 },
      payments: [entry({ paymentType: "deposit", amount: 500 })],
    });

    expect(bill.rent.total).toBe(5000);
    expect(bill.driver?.fee).toBe(2000);
    expect(bill.total).toBe(7000);
    expect(bill.balance).toBe(6500);
  });

  it("shows delivery and collection apart from the rent", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 2,
      quotedTotal: 5700,
      handover: {
        pickupMethod: "within_city",
        returnMethod: "outside_city",
        pickupFee: 300,
        returnFee: 400,
      },
      payments: [],
    });

    expect(bill.rent.total).toBe(5000);
    expect(bill.handover.map((line) => [line.label, line.fee])).toEqual([
      ["Delivery", 300],
      ["Collection", 400],
    ]);
    expect(bill.total).toBe(5700);
  });

  it("shows every-booking fees apart from the rent", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 1,
      quotedTotal: 2700,
      bookingFees: [{ name: "Booking fee", amount: 200 }],
      payments: [],
    });

    expect(bill.rent.total).toBe(2500);
    expect(bill.bookingFees).toEqual([{ name: "Booking fee", amount: 200 }]);
    expect(bill.total).toBe(2700);
  });

  it("lists an office pick-up as free and skips a leg with no method", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 1,
      quotedTotal: 2500,
      handover: { pickupMethod: "office", returnMethod: null, pickupFee: 0, returnFee: 0 },
      payments: [],
    });

    expect(bill.handover).toEqual([
      { leg: "pickup", label: "Pick-up at office", detail: "At our office", fee: 0 },
    ]);
    expect(bill.rent.total).toBe(2500);
  });

  it("adds charges to the rent and subtracts what was paid", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 3,
      quotedTotal: 7500,
      payments: [
        entry({ paymentType: "penalty", amount: 500, method: null, chargeTypeName: "Delivery" }),
        entry({ paymentType: "penalty", amount: 300, method: null, chargeTypeName: "Car wash" }),
        entry({ paymentType: "deposit", amount: 3000 }),
      ],
    });

    expect(bill.charges.map((charge) => charge.chargeTypeName)).toEqual(["Delivery", "Car wash"]);
    expect(bill.total).toBe(8300);
    expect(bill.paid).toBe(3000);
    expect(bill.balance).toBe(5300);
    expect(bill.received).toHaveLength(1);
  });

  it("counts only confirmed money and takes refunds back out", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 1000 },
      quotedDays: 2,
      quotedTotal: 2000,
      payments: [
        entry({ paymentType: "deposit", amount: 600, status: "submitted" }),
        entry({ paymentType: "balance", amount: 2000 }),
        entry({ paymentType: "refund", amount: 200 }),
      ],
    });

    expect(bill.paid).toBe(1800);
    expect(bill.balance).toBe(200);
  });

  it("never shows a negative balance when overpaid", () => {
    const bill = buildRentalBill({
      quotedRates: null,
      quotedDays: null,
      quotedTotal: null,
      payments: [entry({ paymentType: "balance", amount: 500 })],
    });

    expect(bill.total).toBe(0);
    expect(bill.balance).toBe(0);
  });
});

describe("buildRentalBill adjustments", () => {
  it("takes a negative bill adjustment off the total", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 1350 },
      quotedDays: 4,
      quotedTotal: 5400,
      payments: [
        entry({
          paymentType: "penalty",
          amount: -400,
          method: null,
          chargeTypeName: "Bill adjustment",
          chargeTypeCode: "bill_adjustment",
        }),
      ],
    });

    expect(bill.total).toBe(5000);
    expect(bill.balance).toBe(5000);
  });
});

describe("describeRentLine", () => {
  const rates = { daily: 1350, halfDay: 900, hourly: 150 };

  it("spells out elapsed-time rent", () => {
    expect(describeRentLine({ rates, days: 3, hours: 2, total: 4350 })).toBe(
      "3 days 2 hours · ₱1,350.00 × 3 days + 2 hours × ₱150.00",
    );
  });

  it("keeps the calendar-day wording on older quotes", () => {
    expect(describeRentLine({ rates, days: 4, hours: null, total: 5400 })).toBe("₱1,350.00 × 4 days");
  });

  it("is null without a rate", () => {
    expect(describeRentLine({ rates: null, days: null, hours: null, total: 0 })).toBeNull();
  });
});

describe("rentalBillStatus", () => {
  const bill = (paid: number, total = 3000) =>
    buildRentalBill({
      quotedRates: { daily: 1000 },
      quotedDays: 3,
      quotedTotal: total,
      payments: paid ? [entry({ paymentType: "balance", amount: paid })] : [],
    });

  it("reads a counter payment with no deposit as partly paid", () => {
    expect(rentalBillStatus(bill(1000), "unpaid")).toBe("Partly paid");
  });

  it("reads a settled bill as paid in full", () => {
    expect(rentalBillStatus(bill(3000), "deposit_paid")).toBe("Paid in full");
  });

  it("flags an uploaded proof that is not confirmed yet", () => {
    expect(rentalBillStatus(bill(0), "proof_submitted")).toBe("Payment proof to check");
  });

  it("is unpaid with nothing in", () => {
    expect(rentalBillStatus(bill(0), "unpaid")).toBe("Unpaid");
  });
});
