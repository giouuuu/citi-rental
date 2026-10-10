import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  type DocumentInput,
  type EmailInspection,
  buildRentalPdf,
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

const items = [
  { areaCode: "front_bumper", label: "Front bumper", status: "ok", severity: null, notes: null },
  { areaCode: "rear_bumper", label: "Rear bumper", status: "scratch", severity: 1, notes: "Old scuff" },
  { areaCode: "left_door", label: "Left front door", status: "ok", severity: null, notes: null },
];

const pickup: EmailInspection = {
  type: "pickup",
  inspectedAt: "2026-10-12T01:10:00Z",
  odometer: 18250,
  fuelLevel: 100,
  cleanliness: "clean",
  odor: "none",
  notes: null,
  fuelChargeAmount: null,
  fuelChargeNote: null,
  damageChargeAmount: null,
  damageChargeNote: null,
  customerSignaturePath: "rental/signature-1.png",
  customerAcknowledgedAt: "2026-10-12T01:12:00Z",
  mediaCount: 6,
  items,
};

const ret: EmailInspection = {
  ...pickup,
  type: "return",
  inspectedAt: "2026-10-14T09:05:00Z",
  odometer: 18612,
  fuelLevel: 75,
  customerSignaturePath: "rental/signature-2.png",
  fuelChargeAmount: "500.00",
  fuelChargeNote: "One bar short",
  damageChargeAmount: 4500,
  damageChargeNote: "New dent, left front door",
  items: items.map((item) =>
    item.areaCode === "left_door" ? { ...item, status: "dent", severity: 2 } : item,
  ),
};

function input(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    kind: "rental_released",
    referenceNumber: "ZR-2026-0042",
    customerName: "Maria Santos",
    vehicleName: "Toyota Vios",
    plateNumber: "ABC 1234",
    startAt: "2026-10-12T01:00:00Z",
    returnAt: "2026-10-14T09:00:00Z",
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
      ["rental/signature-2.png", PNG],
    ]),
    reportUrl: "https://www.zekecebucarrental.com/account/bookings/1/condition",
    documents: {
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
      inspections: [pickup],
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

describe("buildRentalPdf", () => {
  it("builds the agreement, cancellation policy and pickup report at release", async () => {
    const bytes = await buildRentalPdf(input());
    const doc = await PDFDocument.load(bytes);
    // Agreement, cancellation policy, pickup report.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getTitle()).toContain("ZR-2026-0042");
  });

  it("builds only the pickup report when the car was released without an agreement", async () => {
    const base = input();
    const bytes = await buildRentalPdf({
      ...base,
      documents: { ...base.documents, agreement: null },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("builds the return report with charges at completion", async () => {
    const base = input({ kind: "rental_completed" });
    const bytes = await buildRentalPdf({
      ...base,
      documents: { agreement: null, inspections: [pickup, ret] },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("Return condition report");
  });

  it("still builds when a signature is missing", async () => {
    const bytes = await buildRentalPdf(input({ signatures: new Map() }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe("document helpers", () => {
  it("lists each signature once", () => {
    expect(signaturePaths(input().documents)).toEqual([
      "company/signature.png",
      "rental/signature-1.png",
    ]);
  });

  it("names the file after the booking reference", () => {
    expect(documentFilename("rental_released", "ZR-2026-0042")).toBe(
      "Rental-agreement-and-pickup-report-ZR-2026-0042.pdf",
    );
    expect(documentFilename("rental_completed", null)).toBe("Return-condition-report.pdf");
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
      "Your rental agreement and pickup report: Toyota Vios 2024 (ZR-2026-0042)",
    );
    expect(email.text).toContain("signed rental agreement");
    expect(email.text).toContain("Wed, 14 Oct 2026, 5:00 PM");
    expect(email.text).toContain("Balance due: ₱1,000");
    expect(email.text).not.toContain("Please bring");
  });

  it("mentions the attached report at completion", () => {
    const email = renderBookingEmail({
      kind: "rental_completed",
      booking,
      company,
      siteUrl: "https://www.zekecebucarrental.com",
    });
    expect(email.subject).toBe(
      "Your return condition report: Toyota Vios 2024 (ZR-2026-0042)",
    );
    expect(email.text).toContain("comparing pickup and return");
  });
});
