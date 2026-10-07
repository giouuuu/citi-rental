import { describe, expect, it } from "vitest";

import type { RentalPayment } from "@/features/rentals/types/rental-payment";

import { buildRentalBill, rentalBillStatus } from "./rental-bill";

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
    ...overrides,
  };
}

describe("buildRentalBill", () => {
  it("adds charges to the rent and subtracts what was paid", () => {
    const bill = buildRentalBill({
      quotedDailyRate: 2500,
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
      quotedDailyRate: 1000,
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
      quotedDailyRate: null,
      quotedDays: null,
      quotedTotal: null,
      payments: [entry({ paymentType: "balance", amount: 500 })],
    });

    expect(bill.total).toBe(0);
    expect(bill.balance).toBe(0);
  });
});

describe("rentalBillStatus", () => {
  const bill = (paid: number, total = 3000) =>
    buildRentalBill({
      quotedDailyRate: 1000,
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
