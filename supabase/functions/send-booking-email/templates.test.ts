import { describe, expect, it } from "vitest";

import {
  type BookingEmailBooking,
  type BookingEmailCompany,
  pickupDayWord,
  renderBookingEmail,
} from "./templates";

const booking: BookingEmailBooking = {
  id: "8f0e3c1a-0000-4000-8000-000000000001",
  referenceNumber: "ZR-2026-0042",
  customerName: "Maria Santos",
  vehicleName: "Toyota Vios",
  vehicleYear: 2024,
  vehicleTransmission: "automatic",
  vehicleSeats: 5,
  // 9:00 AM and 5:00 PM Manila time.
  startAt: "2026-10-12T01:00:00Z",
  returnAt: "2026-10-14T09:00:00Z",
  pickupLocation: "Mactan-Cebu International Airport",
  returnLocation: "Mactan-Cebu International Airport",
  destination: null,
  withDriver: false,
  total: "4500.00",
  depositPaid: 500,
  balanceDue: 4000,
};

const company: BookingEmailCompany = {
  phone: "+639171465707",
  email: "zekecebucarrental@gmail.com",
  address: "Consolacion, Cebu",
  timezone: "Asia/Manila",
};

const siteUrl = "https://www.zekecebucarrental.com/";

describe("renderBookingEmail", () => {
  it("confirms the booking with Manila times, money, and a booking link", () => {
    const email = renderBookingEmail({
      kind: "booking_confirmed",
      booking,
      company,
      siteUrl,
    });

    expect(email.subject).toContain("Booking confirmed");
    expect(email.subject).toContain("ZR-2026-0042");
    expect(email.text).toContain("Hi Maria,");
    expect(email.text).toContain("Pickup: Mon, 12 Oct 2026, 9:00 AM — Mactan-Cebu International Airport");
    expect(email.text).toContain("Reservation fee paid: ₱500");
    expect(email.text).toContain("Balance due at pickup: ₱4,000");
    expect(email.text).toContain("Your valid driver's license");
    expect(email.text).toContain(
      "https://www.zekecebucarrental.com/account/bookings/8f0e3c1a-0000-4000-8000-000000000001",
    );
    expect(email.html).toContain("Your booking is confirmed");
  });

  it("asks with-driver renters for an ID only, not a license", () => {
    const email = renderBookingEmail({
      kind: "booking_confirmed",
      booking: { ...booking, withDriver: true },
      company,
      siteUrl,
    });
    expect(email.text).toContain("Service: With driver");
    expect(email.text).not.toContain("driver's license");
  });

  it("acknowledges the deposit without the bring list", () => {
    const email = renderBookingEmail({
      kind: "deposit_confirmed",
      booking,
      company,
      siteUrl,
    });
    expect(email.subject).toBe("Reservation fee received (ZR-2026-0042)");
    expect(email.text).toContain("reservation fee of ₱500");
    expect(email.text).toContain("remaining ₱4,000 is due at pickup");
    expect(email.text).not.toContain("Please bring");
  });

  it("reminds about a pickup tomorrow", () => {
    const email = renderBookingEmail({
      kind: "booking_reminder",
      booking,
      company,
      siteUrl,
      // 10:00 AM Manila the day before.
      now: new Date("2026-10-11T02:00:00Z"),
    });
    expect(email.subject).toBe(
      "Reminder: your Toyota Vios 2024 pickup is tomorrow at 9:00 AM",
    );
    expect(email.html).toContain("See you tomorrow");
  });

  it("escapes customer-entered values in the HTML", () => {
    const email = renderBookingEmail({
      kind: "booking_confirmed",
      booking: {
        ...booking,
        customerName: "<script>alert(1)</script>",
        pickupLocation: 'Hotel "A" & <b>B</b>',
      },
      company,
      siteUrl,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>B</b>");
    expect(email.html).toContain("&lt;b&gt;B&lt;/b&gt;");
  });

  it("leaves out money rows the booking doesn't have", () => {
    const email = renderBookingEmail({
      kind: "booking_confirmed",
      booking: { ...booking, depositPaid: 0, balanceDue: null, total: null },
      company: { ...company, phone: null, email: null, address: null },
      siteUrl,
    });
    expect(email.text).not.toContain("Reservation fee paid");
    expect(email.text).not.toContain("Balance due");
    expect(email.text).not.toContain("Questions?");
  });
});

describe("pickupDayWord", () => {
  it("uses the company time zone, not UTC", () => {
    // 11:30 PM UTC on the 11th is already 7:30 AM on the 12th in Manila.
    expect(
      pickupDayWord("2026-10-12T01:00:00Z", new Date("2026-10-11T23:30:00Z"), "Asia/Manila"),
    ).toBe("today");
    expect(
      pickupDayWord("2026-10-12T01:00:00Z", new Date("2026-10-11T02:00:00Z"), "Asia/Manila"),
    ).toBe("tomorrow");
  });
});
