import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import {
  type BookingEmailBooking,
  type BookingEmailCompany,
  type BookingEmailKind,
  renderBookingEmail,
} from "@/supabase/functions/send-booking-email/templates";

export type EmailPreview = {
  kind: BookingEmailKind;
  label: string;
  /** When the customer gets it. */
  trigger: string;
  subject: string;
  html: string;
  attachment: string | null;
};

const KINDS: Array<Pick<EmailPreview, "kind" | "label" | "trigger" | "attachment">> = [
  {
    kind: "booking_confirmed",
    label: "Booking confirmed",
    trigger: "The booking becomes Reserved: staff confirm it, or confirm its reservation fee.",
    attachment: null,
  },
  {
    kind: "deposit_confirmed",
    label: "Reservation fee received",
    trigger: "Staff confirm the reservation fee on a booking that is already Reserved.",
    attachment: null,
  },
  {
    kind: "booking_reminder",
    label: "Pickup reminder",
    trigger: "Within 24 hours before pickup.",
    attachment: null,
  },
  {
    kind: "rental_released",
    label: "Car released",
    trigger: "The pickup inspection is submitted and the car is released.",
    attachment: "Signed rental agreement (PDF)",
  },
  {
    kind: "rental_completed",
    label: "Rental completed",
    trigger: "The return inspection is submitted and the rental is completed.",
    attachment: null,
  },
];

/** Tomorrow at `hour`:00 Manila time, so the reminder reads "tomorrow". */
function manilaTomorrowAt(hour: number, plusDays = 0): string {
  const manilaNow = new Date(Date.now() + 8 * 3_600_000);
  const day = Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate() + 1 + plusDays,
    hour - 8,
  );
  return new Date(day).toISOString();
}

const SAMPLE_BOOKING: Omit<BookingEmailBooking, "startAt" | "returnAt"> = {
  id: "00000000-0000-4000-8000-000000000000",
  referenceNumber: "ZR-2026-0042",
  customerName: "Maria Santos",
  vehicleName: "Toyota Vios",
  vehicleYear: 2024,
  vehicleTransmission: "automatic",
  vehicleSeats: 5,
  pickupLocation: "Mactan-Cebu International Airport",
  returnLocation: "Mactan-Cebu International Airport",
  destination: "Moalboal",
  withDriver: false,
  total: 4500,
  depositPaid: 500,
  balanceDue: 4000,
};

/** The company values the emails read, the same ones the send function claims. */
async function previewCompany(): Promise<BookingEmailCompany> {
  const fallback: BookingEmailCompany = {
    phone: null,
    email: null,
    address: null,
    timezone: "Asia/Manila",
  };
  if (!isSupabaseConfigured()) return fallback;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_profile")
    .select(
      "legal_name, contact_phone, contact_email, business_address, timezone, review_thank_you_message, review_google_url, review_facebook_url, contact_facebook, contact_messenger",
    )
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("email preview company failed", error.message);
    return fallback;
  }
  const row = data as Record<string, string | null>;
  return {
    name: row.legal_name,
    phone: row.contact_phone,
    email: row.contact_email,
    address: row.business_address,
    timezone: row.timezone || "Asia/Manila",
    thankYouMessage: row.review_thank_you_message,
    reviewGoogleUrl: row.review_google_url,
    reviewFacebookUrl: row.review_facebook_url,
    facebookPage: row.contact_facebook?.trim() || row.contact_messenger,
  };
}

/** Every customer email, rendered with a sample booking and live Settings. */
export async function getEmailPreviews(): Promise<EmailPreview[]> {
  const company = await previewCompany();
  const booking: BookingEmailBooking = {
    ...SAMPLE_BOOKING,
    startAt: manilaTomorrowAt(9),
    returnAt: manilaTomorrowAt(17, 2),
  };
  return KINDS.map((entry) => {
    const email = renderBookingEmail({
      kind: entry.kind,
      // After release and return the reservation fee and balance are settled.
      booking:
        entry.kind === "rental_completed" ? { ...booking, balanceDue: 0 } : booking,
      company,
      siteUrl: siteUrl(),
    });
    return { ...entry, subject: email.subject, html: email.html };
  });
}
