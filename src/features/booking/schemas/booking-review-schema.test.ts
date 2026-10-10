import { describe, expect, it } from "vitest";

import { bookingReviewSchema } from "@/features/booking/schemas/booking-review-schema";

const rentalId = "3f2a7c1e-9b8d-4e6f-a1b2-c3d4e5f60718";

describe("bookingReviewSchema", () => {
  it("accepts a rating and a short review", () => {
    const parsed = bookingReviewSchema.safeParse({ rentalId, rating: "5", body: "  Great car!  " });
    expect(parsed.success && parsed.data).toEqual({ rentalId, rating: 5, body: "Great car!" });
  });

  it("asks for stars", () => {
    const parsed = bookingReviewSchema.safeParse({ rentalId, rating: "", body: "Great car!" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["rating"]);
  });

  it("asks for a few words", () => {
    const parsed = bookingReviewSchema.safeParse({ rentalId, rating: 4, body: " " });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Tell us a little about your trip.");
  });
});
