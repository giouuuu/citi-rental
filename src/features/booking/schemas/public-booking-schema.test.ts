import { describe, expect, it } from "vitest";

import {
  publicBookingSchema,
  returningBookingSchema,
} from "./public-booking-schema";

const photo = (name: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

const valid = {
  vehicleId: "c0000000-0000-4000-8000-000000000003",
  startAt: tomorrow.toISOString(),
  expectedReturnAt: dayAfter.toISOString(),
  fullName: "Alex Rivera",
  phoneNumber: "09171234567",
  driversLicenseNumber: "N01-23-456789",
  address: "Lahug, Cebu City",
  facebookAccount: "facebook.com/alex.rivera",
  pickupLocation: "Mactan Airport",
  returnLocation: "IT Park",
  destination: "Moalboal",
  passengerCount: "4",
  licenseSelfie: photo("selfie.jpg"),
  governmentId: photo("umid.jpg"),
};

function errorsFor(input: Record<string, unknown>) {
  const result = publicBookingSchema.safeParse(input);
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe("publicBookingSchema", () => {
  it("is self-drive unless the renter asks for a driver", () => {
    expect(publicBookingSchema.parse(valid).drivingMode).toBe("self-drive");
    expect(
      publicBookingSchema.parse({ ...valid, drivingMode: "with-driver" })
        .drivingMode,
    ).toBe("with-driver");
    expect(errorsFor({ ...valid, drivingMode: "chauffeur" })).toHaveProperty(
      "drivingMode",
    );
  });

  it("accepts a complete booking and reads passengers as a number", () => {
    const result = publicBookingSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.passengerCount).toBe(4);
  });

  it.each([
    ["address", "Enter your complete address."],
    ["facebookAccount", "Enter your Facebook name or profile link."],
    ["pickupLocation", "Enter the pick-up or delivery location."],
    ["returnLocation", "Enter the return location."],
    ["destination", "Enter your destination."],
    ["passengerCount", "Enter how many passengers."],
  ])("requires %s", (field, message) => {
    expect(errorsFor({ ...valid, [field]: "" })[field as never]).toEqual([
      message,
    ]);
  });

  it("requires both ID photos", () => {
    const errors = errorsFor({
      ...valid,
      licenseSelfie: undefined,
      governmentId: new File([], "empty.jpg", { type: "image/jpeg" }),
    });
    expect(errors.licenseSelfie).toEqual([
      "Upload a selfie holding your driver's license.",
    ]);
    expect(errors.governmentId).toEqual([
      "Upload a photo of another government ID.",
    ]);
  });

  it("rejects a fractional or zero passenger count", () => {
    expect(errorsFor({ ...valid, passengerCount: "2.5" }).passengerCount).toEqual([
      "Enter a whole number.",
    ]);
    expect(errorsFor({ ...valid, passengerCount: "0" }).passengerCount).toEqual([
      "Enter how many passengers.",
    ]);
  });
});

describe("returningBookingSchema", () => {
  it("lets a returning guest omit identity fields but not trip details or IDs", () => {
    const result = returningBookingSchema.safeParse({
      ...valid,
      fullName: "",
      driversLicenseNumber: "",
      address: "",
      facebookAccount: "",
      destination: "",
      licenseSelfie: undefined,
    });
    expect(result.success).toBe(false);
    const errors = result.error?.flatten().fieldErrors ?? {};
    expect(Object.keys(errors).sort()).toEqual(["destination", "licenseSelfie"]);
  });
});
