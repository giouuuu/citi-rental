import { describe, expect, it } from "vitest";

import { bookingDetailsSchema, publicBookingSchema } from "./public-booking-schema";

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
  pickupMethod: "outside_city",
  returnMethod: "within_city",
  pickupLocation: "Mactan Airport",
  returnLocation: "IT Park",
  destination: "Moalboal",
  passengerCount: "4",
  licenseSelfie: photo("selfie.jpg"),
  governmentId: photo("umid.jpg"),
  acceptTerms: true,
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

  it("needs the terms accepted, from the checkbox or FormData", () => {
    expect(errorsFor({ ...valid, acceptTerms: false })).toHaveProperty(
      "acceptTerms",
    );
    expect(errorsFor({ ...valid, acceptTerms: undefined })).toHaveProperty(
      "acceptTerms",
    );
    expect(
      publicBookingSchema.safeParse({ ...valid, acceptTerms: "on" }).success,
    ).toBe(true);
  });

  it("accepts a complete booking and reads passengers as a number", () => {
    const result = publicBookingSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.passengerCount).toBe(4);
  });

  it.each([
    ["address", "Enter your complete address."],
    ["facebookAccount", "Enter your Facebook name or profile link."],
    ["pickupLocation", "Enter the delivery address."],
    ["returnLocation", "Enter where we collect the car."],
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

  it("requires a license number on self-drive only", () => {
    expect(
      errorsFor({ ...valid, driversLicenseNumber: "" }).driversLicenseNumber,
    ).toEqual(["Enter your driver license number."]);
    expect(
      publicBookingSchema.safeParse({
        ...valid,
        drivingMode: "with-driver",
        driversLicenseNumber: undefined,
      }).success,
    ).toBe(true);
  });

  it("names the with-driver ID photos when they are missing", () => {
    const errors = errorsFor({
      ...valid,
      drivingMode: "with-driver",
      licenseSelfie: undefined,
      governmentId: undefined,
    });
    expect(errors.licenseSelfie).toEqual([
      "Upload a selfie holding your government ID.",
    ]);
    expect(errors.governmentId).toEqual([
      "Upload a photo of your government ID.",
    ]);
  });

  it("reports missing photos alongside other field errors", () => {
    const errors = errorsFor({
      ...valid,
      address: "",
      licenseSelfie: undefined,
    });
    expect(errors.address).toBeDefined();
    expect(errors.licenseSelfie).toEqual([
      "Upload a selfie holding your driver's license.",
    ]);
  });

  it("needs where the car is picked up and returned", () => {
    const errors = errorsFor({
      ...valid,
      pickupMethod: undefined,
      returnMethod: "airport",
    });
    expect(errors.pickupMethod).toEqual(["Choose where you get the car."]);
    expect(errors.returnMethod).toEqual(["Choose where you return the car."]);
  });

  it("needs no address when the car changes hands at the office", () => {
    const result = publicBookingSchema.safeParse({
      ...valid,
      pickupMethod: "office",
      returnMethod: "office",
      pickupLocation: "",
      returnLocation: undefined,
    });
    expect(result.success).toBe(true);
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

describe("bookingDetailsSchema", () => {
  const details = {
    rentalId: "c0000000-0000-4000-8000-000000000009",
    fullName: "Alex Rivera",
    phoneNumber: "09171234567",
    driversLicenseNumber: "N01-23-456789",
    address: "Lahug, Cebu City",
    facebookAccount: "facebook.com/alex.rivera",
    pickupMethod: "within_city",
    returnMethod: "office",
    pickupLocation: "Mactan Airport",
    returnLocation: "",
    destination: "Moalboal",
    passengerCount: "3",
  };

  function detailErrors(input: Record<string, unknown>) {
    const result = bookingDetailsSchema.safeParse(input);
    return result.success ? {} : result.error.flatten().fieldErrors;
  }

  it("accepts edited details without dates, photos or terms", () => {
    const result = bookingDetailsSchema.safeParse(details);
    expect(result.success).toBe(true);
    expect(result.data?.passengerCount).toBe(3);
  });

  it("needs a license on self-drive only", () => {
    const noLicense = { ...details, driversLicenseNumber: "" };
    expect(detailErrors(noLicense)).toHaveProperty("driversLicenseNumber");
    expect(
      bookingDetailsSchema.safeParse({ ...noLicense, drivingMode: "with-driver" })
        .success,
    ).toBe(true);
  });

  it("needs the delivery address when switching to delivery", () => {
    expect(
      detailErrors({ ...details, returnMethod: "outside_city" }).returnLocation,
    ).toEqual(["Enter where we collect the car."]);
  });

  it("still requires the renter and trip fields", () => {
    const errors = detailErrors({ ...details, fullName: "", destination: "" });
    expect(errors).toHaveProperty("fullName");
    expect(errors).toHaveProperty("destination");
  });
});
