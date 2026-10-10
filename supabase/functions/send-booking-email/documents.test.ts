import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  type DocumentInput,
  buildAgreementPdf,
  documentFilename,
  pdfText,
  signaturePaths,
} from "./documents";
import { renderBookingEmail } from "./templates";

// A 1×1 transparent PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

function input(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    referenceNumber: "ZR-2026-0042",
    vehicleName: "Toyota Vios",
    plateNumber: "ABC 1234",
    company: {
      name: "Zeke's Car Rental Services",
      phone: "+639171465707",
      email: "zekecebucarrental@gmail.com",
      address: "Consolacion, Cebu",
      timezone: "Asia/Manila",
    },
    signatures: new Map([
      ["company/signature.png", PNG],
      ["rental/signature-1.png", PNG],
    ]),
    agreement: {
      terms: {
        title: "Car Rental Agreement",
        intro: "The renter hereby agrees to the terms and conditions stated in this form:",
        clauses: ["The renter states that they are over 18 years old."],
        penalties: { heading: "Penalties", items: ["Racing"] },
        fines: [{ label: "Smoking inside the car", amount: 2000 }],
        otherCharges: [{ label: "Car wash fee", detail: "₱300" }],
        prohibitedUse: { intro: "Do not:", items: ["Smuggle"], closing: "Thanks." },
        reminders: [{ label: "Fuel", text: "₱500 per bar." }],
        acknowledgement: "By signing below, the parties agree.",
        cancellation: {
          title: "Car Rental Cancellation Policy",
          intro: "Please review.",
          sections: [{ heading: "No-show policy", body: "Forfeited." }],
          closing: "Thank you.",
        },
      },
      companyName: "Zeke's Car Rental Services",
      companyAddress: "Consolacion, Cebu",
      companyPhone: "+639171465707",
      companyEmail: "zekecebucarrental@gmail.com",
      companySignaturePath: "company/signature.png",
      renterName: "Maria Santos",
      renterLicenseNumber: "N01-23-456789",
      renterAddress: "Lahug, Cebu City",
      renterSignaturePath: "rental/signature-1.png",
      rentalReference: "ZR-2026-0042",
      vehicleLabel: "Toyota Vios 2024",
      plateNumber: "ABC 1234",
      startAt: "2026-10-12T01:00:00Z",
      expectedReturnAt: "2026-10-14T09:00:00Z",
      signedAt: "2026-10-12T01:12:00Z",
    },
    ...overrides,
  };
}

describe("pdfText", () => {
  it("spells out the peso sign the standard fonts cannot draw", () => {
    expect(pdfText("Fine: ₱4,500 — per panel")).toBe("Fine: PHP 4,500 — per panel");
  });

  it("replaces characters outside Windows-1252", () => {
    expect(pdfText("Lahug ✓ Cebu")).toBe("Lahug ? Cebu");
  });
});

describe("buildAgreementPdf", () => {
  it("builds the agreement and cancellation policy", async () => {
    const doc = await PDFDocument.load(await buildAgreementPdf(input()));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toBe("Rental agreement — ZR-2026-0042");
  });

  it("still builds when a signature is missing", async () => {
    const bytes = await buildAgreementPdf(input({ signatures: new Map() }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });
});

describe("document helpers", () => {
  it("lists each signature once", () => {
    expect(signaturePaths(input().agreement)).toEqual([
      "company/signature.png",
      "rental/signature-1.png",
    ]);
  });

  it("names the file after the booking reference", () => {
    expect(documentFilename("ZR-2026-0042")).toBe("Rental-agreement-ZR-2026-0042.pdf");
    expect(documentFilename(null)).toBe("Rental-agreement.pdf");
  });
});

describe("release and return emails", () => {
  const booking = {
    id: "8f0e3c1a-0000-4000-8000-000000000001",
    referenceNumber: "ZR-2026-0042",
    customerName: "Maria Santos",
    vehicleName: "Toyota Vios",
    vehicleYear: 2024,
    vehicleTransmission: "automatic",
    vehicleSeats: 5,
    startAt: "2026-10-12T01:00:00Z",
    returnAt: "2026-10-14T09:00:00Z",
    pickupLocation: null,
    returnLocation: null,
    destination: null,
    withDriver: false,
    total: 4500,
    depositPaid: 500,
    balanceDue: 1000,
  };
  const company = { phone: null, email: null, address: null, timezone: "Asia/Manila" };

  it("mentions the attached agreement and the return time at release", () => {
    const email = renderBookingEmail({
      kind: "rental_released",
      booking,
      company,
      siteUrl: "https://www.zekecebucarrental.com",
    });
    expect(email.subject).toBe(
      "Your rental agreement: Toyota Vios 2024 (ZR-2026-0042)",
    );
    expect(email.text).toContain("signed rental agreement");
    expect(email.text).not.toContain("condition report");
    expect(email.text).toContain("Wed, 14 Oct 2026, 5:00 PM");
    expect(email.text).toContain("Balance due: ₱1,000");
    expect(email.text).not.toContain("Please bring");
  });

  it("thanks the renter with the final bill at completion", () => {
    const email = renderBookingEmail({
      kind: "rental_completed",
      booking,
      company,
      siteUrl: "https://www.zekecebucarrental.com",
      bill: {
        rent: "4500.00",
        charges: [
          { label: "Fuel shortage", amount: "500.00" },
          { label: "Bill adjustment", amount: -200 },
        ],
        paid: 3800,
      },
    });
    expect(email.subject).toBe("Thank you for renting with us: Toyota Vios 2024 (ZR-2026-0042)");
    expect(email.text).toContain("Car rental: ₱4,500");
    expect(email.text).toContain("Fuel shortage: ₱500");
    expect(email.text).toContain("Bill adjustment: -₱200");
    expect(email.text).toContain("Total: ₱4,800");
    expect(email.text).toContain("Amount paid: ₱3,800");
    expect(email.text).toContain("Balance due: ₱1,000");
    expect(email.text).toContain("A balance of ₱1,000 remains");
    expect(email.text).not.toContain("condition report");
    expect(email.html).toContain("Final bill");
  });

  it("says a fully paid bill needs nothing more", () => {
    const email = renderBookingEmail({
      kind: "rental_completed",
      booking: { ...booking, withDriver: true },
      company,
      siteUrl: "https://www.zekecebucarrental.com",
      bill: { rent: 4500, charges: [], paid: 4500 },
    });
    expect(email.text).toContain("Car rental with driver: ₱4,500");
    expect(email.text).toContain("Balance due: ₱0");
    expect(email.text).toContain("paid in full");
  });
});
