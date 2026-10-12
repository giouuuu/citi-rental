import { describe, expect, it } from "vitest";

import { buildRentalBill } from "@/features/rentals/lib/rental-bill";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";

import {
  costableLines,
  parseRentalCosts,
  type RentalCost,
  summarizeRentalCosts,
} from "./rental-costs";

const WASH_TYPE = "0b6c0000-0000-4000-8000-000000000001";

function charge(overrides: Partial<RentalPayment>): RentalPayment {
  return {
    id: crypto.randomUUID(),
    rentalId: "rental",
    paymentType: "penalty",
    amount: 0,
    currency: "PHP",
    method: null,
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

function cost(overrides: Partial<RentalCost>): RentalCost {
  return {
    expenseId: crypto.randomUUID(),
    paymentId: null,
    line: null,
    description: "Expense",
    category: "Miscellaneous",
    amount: 0,
    expenseDate: "2026-10-12",
    ...overrides,
  };
}

function onlineBill(payments: RentalPayment[] = []) {
  return buildRentalBill({
    quotedRates: { daily: 2500 },
    quotedDays: 2,
    quotedTotal: 5900,
    handover: { pickupMethod: "within_city", returnMethod: "office", pickupFee: 300, returnFee: 0 },
    bookingFees: [{ name: "Car wash", amount: 300, chargeTypeId: WASH_TYPE }],
    payments,
  });
}

describe("costableLines", () => {
  it("offers delivery legs with a fee, booking fees and charges", () => {
    const extension = charge({ amount: 1000, chargeTypeName: "Extension" });
    const adjustment = charge({ amount: -200, chargeTypeCode: "bill_adjustment" });

    expect(costableLines(onlineBill([extension, adjustment]))).toEqual([
      { key: "pickup", name: "Delivery", amount: 300, target: { line: "pickup" } },
      { key: `fee:${WASH_TYPE}`, name: "Car wash", amount: 300, target: { line: `fee:${WASH_TYPE}` } },
      { key: extension.id, name: "Extension", amount: 1000, target: { paymentId: extension.id } },
    ]);
  });

  it("skips a booking fee stored without its charge type", () => {
    const bill = buildRentalBill({
      quotedRates: { daily: 2500 },
      quotedDays: 1,
      quotedTotal: 2700,
      bookingFees: [{ name: "Booking fee", amount: 200 }],
      payments: [],
    });
    expect(costableLines(bill)).toEqual([]);
  });
});

describe("summarizeRentalCosts", () => {
  it("sets the lines that carry a cost against what they cost", () => {
    const extension = charge({ amount: 1000, chargeTypeName: "Extension" });
    const bill = onlineBill([extension]);
    const costs = [
      cost({ line: "pickup", amount: 250 }),
      cost({ line: `fee:${WASH_TYPE}`, amount: 300 }),
    ];

    expect(summarizeRentalCosts(costableLines(bill), costs)).toEqual({
      charged: 600,
      costs: 550,
      kept: 50,
      other: [],
      otherTotal: 0,
    });
  });

  it("goes negative when a charge cost more than it brought in", () => {
    const delivery = charge({ amount: 300, chargeTypeName: "Delivery" });
    const summary = summarizeRentalCosts(costableLines(onlineBill([delivery])), [
      cost({ paymentId: delivery.id, amount: 400 }),
    ]);
    expect(summary).toMatchObject({ charged: 300, costs: 400, kept: -100 });
  });

  it("lists costs tagged from Finance apart", () => {
    const parking = cost({ description: "Parking at the airport", amount: 150 });
    const summary = summarizeRentalCosts(costableLines(onlineBill()), [parking]);
    expect(summary).toEqual({ charged: 0, costs: 0, kept: 0, other: [parking], otherTotal: 150 });
  });

  it("is null when the rental has no costs", () => {
    expect(summarizeRentalCosts(costableLines(onlineBill()), [])).toBeNull();
  });
});

describe("parseRentalCosts", () => {
  it("reads the RPC payload and drops malformed rows", () => {
    expect(
      parseRentalCosts({
        can_open_finance: true,
        costs: [
          {
            expense_id: "e1",
            payment_id: null,
            line: "pickup",
            description: "Delivery · WEB-1",
            category: "Transportation and travel",
            amount: "250.00",
            expense_date: "2026-10-12",
          },
          { expense_id: null, amount: 10 },
        ],
      }),
    ).toEqual({
      canOpenFinance: true,
      costs: [
        {
          expenseId: "e1",
          paymentId: null,
          line: "pickup",
          description: "Delivery · WEB-1",
          category: "Transportation and travel",
          amount: 250,
          expenseDate: "2026-10-12",
        },
      ],
    });
  });

  it("is empty for anyone the RPC refuses", () => {
    expect(parseRentalCosts(null)).toEqual({ costs: [], canOpenFinance: false });
  });
});
