import { describe, expect, it } from "vitest";

import { bookingPaymentStep, customerPaymentKind } from "./booking-payment-step";

const booking = {
  status: "draft",
  paymentStatus: "unpaid",
  depositAmount: 500,
  billTotal: 3000,
  amountPaid: 0,
};

describe("customerPaymentKind", () => {
  it("asks a draft for the reservation fee until it is confirmed", () => {
    expect(customerPaymentKind(booking)).toBe("reservation_fee");
    expect(customerPaymentKind({ ...booking, paymentStatus: "proof_submitted" })).toBe(
      "reservation_fee",
    );
    expect(customerPaymentKind({ ...booking, paymentStatus: "deposit_paid" })).toBeNull();
  });

  it("still asks for the fee when staff reserved the booking before any payment", () => {
    expect(customerPaymentKind({ ...booking, status: "reserved" })).toBe("reservation_fee");
  });

  it("goes straight to the bill when staff reserved it with no fee asked", () => {
    expect(customerPaymentKind({ ...booking, status: "reserved", depositAmount: null })).toBe(
      "open_bill",
    );
  });

  it("goes to the bill once anything was paid", () => {
    expect(
      customerPaymentKind({ ...booking, status: "reserved", amountPaid: 1000 }),
    ).toBe("open_bill");
    expect(
      customerPaymentKind({
        ...booking,
        status: "reserved",
        paymentStatus: "deposit_paid",
        amountPaid: 500,
      }),
    ).toBe("open_bill");
  });

  it("takes bill payments during and after the trip while a balance is left", () => {
    for (const status of ["active", "overdue", "completed"]) {
      expect(
        customerPaymentKind({ ...booking, status, paymentStatus: "deposit_paid", amountPaid: 500 }),
      ).toBe("open_bill");
    }
  });

  it("has nothing to pay once the bill is settled, or on a cancelled booking", () => {
    expect(
      customerPaymentKind({
        ...booking,
        status: "completed",
        paymentStatus: "paid_in_full",
        amountPaid: 3000,
      }),
    ).toBeNull();
    expect(customerPaymentKind({ ...booking, status: "cancelled" })).toBeNull();
  });
});

describe("bookingPaymentStep", () => {
  const details = {
    paymentKind: "reservation_fee" as const,
    paymentStatus: "unpaid",
    depositAmount: 500,
    depositPending: false,
    billTotal: 3000,
    amountPaid: 0,
    pendingPaymentAmount: 0,
  };

  it("asks for the fee, then waits while it is checked", () => {
    expect(bookingPaymentStep(details)).toEqual({ kind: "reservation_fee", amount: 500 });
    expect(bookingPaymentStep({ ...details, depositPending: true })).toEqual({
      kind: "reservation_fee_sent",
    });
  });

  it("offers the open balance less payments still being checked", () => {
    expect(
      bookingPaymentStep({
        ...details,
        paymentKind: "open_bill",
        amountPaid: 500,
        pendingPaymentAmount: 1000,
      }),
    ).toEqual({ kind: "open_bill", balance: 2500, pending: 1000, payable: 1500 });
  });

  it("waits when payments being checked cover the balance", () => {
    expect(
      bookingPaymentStep({
        ...details,
        paymentKind: "open_bill",
        amountPaid: 500,
        pendingPaymentAmount: 2500,
      }),
    ).toEqual({ kind: "open_bill_sent", balance: 2500, pending: 2500 });
  });

  it("has nothing due without a payment kind", () => {
    expect(bookingPaymentStep({ ...details, paymentKind: null })).toEqual({
      kind: "nothing_due",
    });
  });
});
