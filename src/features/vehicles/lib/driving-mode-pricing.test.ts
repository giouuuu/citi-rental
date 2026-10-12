import { describe, expect, it } from "vitest";

import {
  parseVehicleBookingCharges,
  vehicleBookingFees,
  vehicleDailyRate,
} from "./driving-mode-pricing";

const avanza = {
  daily_rate: 2300,
  with_driver_daily_rate: 2600,
  booking_charges: [
    { name: "Car wash", amount: 300, driving_mode: "self_drive" as const },
    { name: "Toll kit", amount: 100, driving_mode: "with_driver" as const },
  ],
};

describe("driving-mode pricing", () => {
  it("uses the self-drive rate and charges on a self-drive trip", () => {
    expect(vehicleDailyRate(avanza, false)).toBe(2300);
    expect(vehicleBookingFees(avanza, false)).toEqual([{ name: "Car wash", amount: 300 }]);
  });

  it("uses the with-driver rate and charges with a driver", () => {
    expect(vehicleDailyRate(avanza, true)).toBe(2600);
    expect(vehicleBookingFees(avanza, true)).toEqual([{ name: "Toll kit", amount: 100 }]);
  });

  it("falls back to the self-drive rate when the car has no with-driver rate", () => {
    expect(vehicleDailyRate({ ...avanza, with_driver_daily_rate: null }, true)).toBe(2300);
  });

  it("drops malformed charges from a public read", () => {
    expect(
      parseVehicleBookingCharges([
        { name: "Car wash", amount: "300.00", driving_mode: "self_drive" },
        { name: "", amount: 100, driving_mode: "self_drive" },
        { name: "Bad mode", amount: 100, driving_mode: "both" },
        { name: "Free", amount: 0, driving_mode: "with_driver" },
        null,
      ]),
    ).toEqual([{ name: "Car wash", amount: 300, driving_mode: "self_drive" }]);
  });
});
