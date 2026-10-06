import { z } from "zod";

/** Turnstile `action` for the lookup widget; siteverify must echo it back. */
export const TURNSTILE_LOOKUP_ACTION = "booking-lookup";

export type BookingContactKind = "email" | "phone";

export type BookingContact = {
  kind: BookingContactKind;
  /** Lower-cased email, or the canonical phone from `normalizePhone`. */
  value: string;
};

export type ResolvedBookingContact = BookingContact & {
  returning: boolean;
  /** First initial of the customer on file — never the full name. */
  initial?: string;
};

const completeEmail = z
  .string()
  .regex(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/, "Enter your full email address.")
  .pipe(z.email("Enter your full email address."));

/**
 * Canonical phone for matching. PH mobiles (09…, 639…, 9… with 10 digits)
 * become +639XXXXXXXXX; anything else becomes +<digits>.
 * Mirrors private.normalize_phone() in the 20261008090000 migration.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return `+${digits}`;
}

/**
 * A contact the lookup may search for. Only a complete identifier qualifies:
 * a full email with a real TLD, a full PH mobile, or an international number
 * typed with its "+" country code (8–15 digits). Partial input returns null,
 * so nothing is ever searched by prefix.
 */
export function parseBookingContact(raw: string): BookingContact | null {
  const input = raw.trim();
  if (!input) return null;

  if (input.includes("@")) {
    const email = input.toLowerCase();
    return completeEmail.safeParse(email).success
      ? { kind: "email", value: email }
      : null;
  }

  if (!/^\+?[\d\s().-]+$/.test(input)) return null;

  const digits = input.replace(/\D/g, "");
  const isPhMobile =
    /^09\d{9}$/.test(digits) ||
    /^639\d{9}$/.test(digits) ||
    (/^9\d{9}$/.test(digits) && !input.startsWith("+"));
  // "+63…" is the PH country code, so it must be a full PH mobile above.
  const isInternational =
    input.startsWith("+") &&
    !digits.startsWith("63") &&
    digits.length >= 8 &&
    digits.length <= 15;

  if (!isPhMobile && !isInternational) return null;
  const value = normalizePhone(input);
  return value ? { kind: "phone", value } : null;
}

/** Hint for the contact field while the identifier is still incomplete. */
export function bookingContactHint(raw: string): string | null {
  const input = raw.trim();
  if (!input || parseBookingContact(input)) return null;
  return input.includes("@")
    ? "Keep typing — enter your full email address."
    : "Keep typing — enter your full mobile number, e.g. 0917 123 4567.";
}
