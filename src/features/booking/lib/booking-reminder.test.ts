import { describe, expect, it } from "vitest";

import type { CustomerBooking } from "@/features/booking/types/customer-booking";

import { pickBookingReminder } from "./booking-reminder";

const NOW = new Date("2026-10-10T04:00:00.000Z");

function booking(overrides: Partial<CustomerBooking>): CustomerBooking {
  return {
    id: "r1",
    referenceNumber: "ZK-0001",
    status: "reserved",
    paymentStatus: "deposit_paid",
    startAt: "2026-10-12T00:00:00.000Z",
    expectedReturnAt: "2026-10-14T00:00:00.000Z",
    actualReturnAt: null,
    pickupLocation: null,
    returnLocation: null,
    vehicleId: "v1",
    vehicleName: "Avanza",
    vehicleMake: "Toyota",
    vehicleModel: "Avanza",
    vehiclePhotoUrl: null,
    quotedTotal: 4600,
    depositAmount: 500,
    balanceDue: 4100,
    createdAt: "2026-10-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("booking reminder", () => {
  it("is nothing without a live booking", () => {
    expect(pickBookingReminder([], NOW)).toBeNull();
    expect(
      pickBookingReminder([booking({ status: "completed" })], NOW),
    ).toBeNull();
  });

  it("puts an unpaid booking ahead of a reserved one, linking to payment", () => {
    const reminder = pickBookingReminder(
      [
        booking({ id: "reserved" }),
        booking({
          id: "draft",
          referenceNumber: "ZK 2",
          status: "draft",
          paymentStatus: "unpaid",
          startAt: "2026-10-20T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(reminder?.kind).toBe("pay");
    expect(reminder?.href).toBe("/book/pay/draft?ref=ZK%202");
    expect(reminder?.moreCount).toBe(1);
  });

  it("says a submitted proof is under review", () => {
    const reminder = pickBookingReminder(
      [booking({ status: "draft", paymentStatus: "proof_submitted" })],
      NOW,
    );
    expect(reminder?.kind).toBe("proof-review");
  });

  it("drops drafts whose pick-up has passed", () => {
    expect(
      pickBookingReminder(
        [
          booking({
            status: "draft",
            paymentStatus: "unpaid",
            startAt: "2026-10-09T00:00:00.000Z",
          }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("prefers the trip on the road, then the soonest reservation", () => {
    expect(
      pickBookingReminder(
        [
          booking({ id: "later", startAt: "2026-11-01T00:00:00.000Z" }),
          booking({ id: "active", status: "active" }),
        ],
        NOW,
      )?.booking.id,
    ).toBe("active");
    const upcoming = pickBookingReminder(
      [
        booking({ id: "later", startAt: "2026-11-01T00:00:00.000Z" }),
        booking({ id: "soon" }),
      ],
      NOW,
    );
    expect(upcoming?.booking.id).toBe("soon");
    expect(upcoming?.kind).toBe("upcoming");
    expect(upcoming?.href).toBe("/account#current-bookings");
  });
});
