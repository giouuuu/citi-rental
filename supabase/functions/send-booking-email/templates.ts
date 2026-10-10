/**
 * Customer booking emails for Zeke Car Rental & Services.
 *
 * Pure functions with no imports so the Edge Function (Deno) and the app's
 * vitest suite (Node) can both load this file.
 */

export type BookingEmailKind =
  | "booking_confirmed"
  | "deposit_confirmed"
  | "booking_reminder"
  // Sent with the signed agreement as a PDF (documents.ts).
  | "rental_released"
  // A thank-you with the final bill.
  | "rental_completed";

export type BookingEmailBooking = {
  id: string;
  referenceNumber: string | null;
  customerName: string | null;
  vehicleName: string | null;
  vehicleYear: number | null;
  vehicleTransmission: string | null;
  vehicleSeats: number | null;
  startAt: string;
  returnAt: string;
  pickupLocation: string | null;
  returnLocation: string | null;
  destination: string | null;
  withDriver: boolean;
  total: number | string | null;
  depositPaid: number | string | null;
  balanceDue: number | string | null;
};

export type BookingEmailCompany = {
  /** Registered business name, printed on the PDFs. */
  name?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string | null;
};

/** The final bill, read from the payments ledger like the ops bill. */
export type EmailBill = {
  /** quoted_total: the car, and the driver on a with-driver rental. */
  rent: number | string;
  /** Confirmed charges in the order they were added; adjustments may be negative. */
  charges: Array<{ label: string; amount: number | string }>;
  /** Confirmed money in, less refunds. */
  paid: number | string;
};

export type BookingEmailInput = {
  kind: BookingEmailKind;
  booking: BookingEmailBooking;
  company: BookingEmailCompany;
  siteUrl: string;
  /** rental_completed only. */
  bill?: EmailBill | null;
  now?: Date;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export const BRAND_NAME = "Zeke Car Rental & Services";

const INK = "#0B1728";
const MUTED = "#5B6B7F";
const LINE = "#E3E9EF";
const SURFACE = "#F1F6F9";
const ACTION = "#0F766E";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function amount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Date parts in the company's time zone. Assembled by hand because ICU builds
 * (Node vs Deno) disagree on locale punctuation and "am" vs "AM".
 */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const monthNumber = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "2-digit",
  }).format(date);
  return {
    weekday: part("weekday"),
    day: part("day"),
    month: part("month"),
    monthNumber,
    year: part("year"),
    time: `${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`,
  };
}

/** "Mon, 12 Oct 2026, 9:00 AM" */
export function formatWhen(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}, ${p.time}`;
}

function formatTime(iso: string, timeZone: string): string {
  return zonedParts(new Date(iso), timeZone).time;
}

function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${p.monthNumber}-${p.day.padStart(2, "0")}`;
}

/** "today" or "tomorrow" relative to `now`, in the company's time zone. */
export function pickupDayWord(startAt: string, now: Date, timeZone: string) {
  return dayKey(new Date(startAt), timeZone) === dayKey(now, timeZone)
    ? "today"
    : "tomorrow";
}

function signedPeso(value: number): string {
  return value < 0 ? `-${formatPeso(-value)}` : formatPeso(value);
}

const round = (value: number) => Math.round(value * 100) / 100;

type BillSummary = {
  lines: Row[];
  total: number;
  paid: number;
  balance: number;
};

/** Rent plus charges, less what was paid: the same formula as the ops bill. */
export function summarizeBill(bill: EmailBill, withDriver: boolean): BillSummary {
  const rent = amount(bill.rent) ?? 0;
  const charges = bill.charges.map((charge) => ({
    label: charge.label,
    value: amount(charge.amount) ?? 0,
  }));
  const total = round(rent + charges.reduce((sum, charge) => sum + charge.value, 0));
  const paid = round(amount(bill.paid) ?? 0);
  return {
    lines: [
      { label: withDriver ? "Car rental with driver" : "Car rental", value: formatPeso(rent) },
      ...charges.map((charge) => ({ label: charge.label, value: signedPeso(charge.value) })),
    ],
    total,
    paid,
    balance: Math.max(0, round(total - paid)),
  };
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function carLabel(booking: BookingEmailBooking): string {
  const name = booking.vehicleName?.trim() || "Your car";
  return booking.vehicleYear ? `${name} ${booking.vehicleYear}` : name;
}

type Row = { label: string; value: string };

function detailRows(
  booking: BookingEmailBooking,
  timeZone: string,
  kind: BookingEmailKind,
): Row[] {
  const rows: Row[] = [];
  if (booking.referenceNumber) {
    rows.push({ label: "Reference", value: booking.referenceNumber });
  }
  const specs = [
    booking.vehicleTransmission
      ? booking.vehicleTransmission.charAt(0).toUpperCase() +
        booking.vehicleTransmission.slice(1)
      : null,
    booking.vehicleSeats ? `${booking.vehicleSeats} seats` : null,
  ].filter(Boolean);
  rows.push({
    label: "Car",
    value: specs.length ? `${carLabel(booking)} · ${specs.join(" · ")}` : carLabel(booking),
  });
  rows.push({
    label: "Service",
    value: booking.withDriver ? "With driver" : "Self-drive",
  });
  rows.push({
    label: "Pickup",
    value: [formatWhen(booking.startAt, timeZone), booking.pickupLocation?.trim()]
      .filter(Boolean)
      .join(" — "),
  });
  rows.push({
    label: "Return",
    value: [formatWhen(booking.returnAt, timeZone), booking.returnLocation?.trim()]
      .filter(Boolean)
      .join(" — "),
  });
  if (booking.destination?.trim()) {
    rows.push({ label: "Destination", value: booking.destination.trim() });
  }

  // The thank-you email shows the money in its bill instead.
  if (kind === "rental_completed") return rows;

  const total = amount(booking.total);
  const deposit = amount(booking.depositPaid);
  const balance = amount(booking.balanceDue);
  if (total != null) rows.push({ label: "Total", value: formatPeso(total) });
  if (deposit != null && deposit > 0) {
    rows.push({ label: "Reservation fee paid", value: formatPeso(deposit) });
  }
  if (balance != null && balance > 0) {
    rows.push({
      label: kind === "rental_released" ? "Balance due" : "Balance due at pickup",
      value: formatPeso(balance),
    });
  }
  return rows;
}

function bringList(booking: BookingEmailBooking): string[] {
  const items = booking.withDriver
    ? ["A valid government-issued ID"]
    : ["Your valid driver's license", "A valid government-issued ID"];
  const balance = amount(booking.balanceDue);
  if (balance != null && balance > 0) {
    items.push(`The remaining balance of ${formatPeso(balance)}`);
  }
  return items;
}

type Copy = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  showBring: boolean;
  /** Paragraphs after the details (and the bill). */
  closing?: string[];
};

function copyFor(input: BookingEmailInput, timeZone: string): Copy {
  const { booking, kind } = input;
  const car = carLabel(booking);
  const ref = booking.referenceNumber ? ` (${booking.referenceNumber})` : "";
  const deposit = amount(booking.depositPaid);
  const balance = amount(booking.balanceDue);
  const pickup = formatWhen(booking.startAt, timeZone);

  switch (kind) {
    case "booking_confirmed":
      return {
        subject: `Booking confirmed: ${car}, ${pickup}${ref}`,
        preheader: `Your ${car} is reserved for ${pickup}.`,
        heading: "Your booking is confirmed",
        paragraphs: [
          `We've confirmed your booking. Your ${car} is reserved for you.`,
          ...(deposit != null && deposit > 0
            ? [`We've received your reservation fee of ${formatPeso(deposit)}.`]
            : []),
          "We'll send a reminder the day before your pickup.",
        ],
        showBring: true,
      };
    case "deposit_confirmed":
      return {
        subject: `Reservation fee received${ref}`,
        preheader: `We've received your reservation fee for your ${car}.`,
        heading: "Reservation fee received",
        paragraphs: [
          deposit != null && deposit > 0
            ? `We've received your reservation fee of ${formatPeso(deposit)}. Thank you!`
            : "We've received your reservation fee. Thank you!",
          ...(balance != null && balance > 0
            ? [`The remaining ${formatPeso(balance)} is due at pickup.`]
            : []),
        ],
        showBring: false,
      };
    case "booking_reminder": {
      const day = pickupDayWord(booking.startAt, input.now ?? new Date(), timeZone);
      const time = formatTime(booking.startAt, timeZone);
      return {
        subject: `Reminder: your ${car} pickup is ${day} at ${time}`,
        preheader: `Pickup ${day} at ${time}${booking.pickupLocation ? ` — ${booking.pickupLocation}` : ""}.`,
        heading: `See you ${day}`,
        paragraphs: [
          `Your ${car} pickup is ${day} at ${time}. Here are your booking details.`,
          "Need to change something? Message or call us as soon as you can.",
        ],
        showBring: true,
      };
    }
    case "rental_released":
      return {
        subject: `Your rental agreement: ${car}${ref}`,
        preheader: `Your signed rental agreement for your ${car}.`,
        heading: "Enjoy your trip",
        paragraphs: [
          `Your ${car} has been released to you. Attached is a PDF of your signed rental agreement.`,
          `Please return the car by ${formatWhen(booking.returnAt, timeZone)}. Keep this email for your records.`,
        ],
        showBring: false,
      };
    case "rental_completed": {
      const bill = input.bill ? summarizeBill(input.bill, booking.withDriver) : null;
      return {
        subject: `Thank you for renting with us: ${car}${ref}`,
        preheader: bill
          ? `Your rental is complete. Your final bill comes to ${formatPeso(bill.total)}.`
          : "Your rental is complete.",
        heading: "Thank you for renting with us",
        paragraphs: [
          `Thank you for choosing ${BRAND_NAME}. Your ${car} has been returned and your rental is now complete.`,
          bill
            ? "Below is your final bill for your records."
            : "You can view your final bill on your booking page.",
        ],
        showBring: false,
        closing: [
          ...(bill == null
            ? []
            : bill.balance > 0
              ? [
                  `A balance of ${formatPeso(bill.balance)} remains on your bill. Please settle it with our staff, or reply to this email if you have any questions about your charges.`,
                ]
              : ["Your bill has been paid in full. No further payment is needed."]),
          "We truly appreciate your business and look forward to serving you on your next trip.",
        ],
      };
    }
  }
}

export function renderBookingEmail(input: BookingEmailInput): RenderedEmail {
  const timeZone = input.company.timezone?.trim() || "Asia/Manila";
  const copy = copyFor(input, timeZone);
  const rows = detailRows(input.booking, timeZone, input.kind);
  const bring = copy.showBring ? bringList(input.booking) : [];
  const bill =
    input.kind === "rental_completed" && input.bill
      ? summarizeBill(input.bill, input.booking.withDriver)
      : null;
  const billRows: Row[] = bill
    ? [
        ...bill.lines,
        { label: "Total", value: formatPeso(bill.total) },
        { label: "Amount paid", value: formatPeso(bill.paid) },
        { label: "Balance due", value: formatPeso(bill.balance) },
      ]
    : [];
  const closing = copy.closing ?? [];
  const name = firstName(input.booking.customerName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const bookingUrl = `${input.siteUrl.replace(/\/$/, "")}/account/bookings/${encodeURIComponent(input.booking.id)}`;
  const contact = [
    input.company.phone?.trim(),
    input.company.email?.trim(),
  ].filter((value): value is string => Boolean(value));
  const address = input.company.address?.trim() || null;

  const text = [
    greeting,
    "",
    ...copy.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...rows.map((row) => `${row.label}: ${row.value}`),
    "",
    ...(billRows.length
      ? ["Final bill", ...billRows.map((row) => `${row.label}: ${row.value}`), ""]
      : []),
    ...closing.flatMap((paragraph) => [paragraph, ""]),
    ...(bring.length
      ? ["Please bring:", ...bring.map((item) => `- ${item}`), ""]
      : []),
    `View your booking: ${bookingUrl}`,
    "",
    contact.length ? `Questions? ${contact.join(" · ")}` : "",
    BRAND_NAME,
    address ?? "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const e = escapeHtml;
  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${LINE};color:${MUTED};font-size:14px;width:42%;vertical-align:top;">${e(row.label)}</td>
          <td style="padding:10px 0;border-top:1px solid ${LINE};color:${INK};font-size:14px;font-weight:600;vertical-align:top;">${e(row.value)}</td>
        </tr>`,
    )
    .join("");
  // Line items, then Total, Amount paid and Balance due set apart below a rule.
  const totalsFrom = billRows.length - 3;
  const billHtml = billRows.length
    ? `
      <p style="margin:24px 0 8px;color:${INK};font-size:15px;font-weight:600;">Final bill</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">
        ${billRows
          .map((row, index) => {
            const isTotal = index === totalsFrom;
            const isTotals = index >= totalsFrom;
            const border = isTotal ? `2px solid ${INK}` : `1px solid ${LINE}`;
            // Total and Balance due are the two figures that matter.
            const strong = isTotal || index === billRows.length - 1;
            return `
        <tr>
          <td style="padding:10px 0;border-top:${border};color:${isTotals ? INK : MUTED};font-size:14px;font-weight:${strong ? 700 : 400};vertical-align:top;">${e(row.label)}</td>
          <td align="right" style="padding:10px 0;border-top:${border};color:${INK};font-size:14px;font-weight:${strong ? 700 : 600};vertical-align:top;white-space:nowrap;">${e(row.value)}</td>
        </tr>`;
          })
          .join("")}
      </table>`
    : "";
  const closingHtml = closing
    .map(
      (paragraph, index) =>
        `<p style="margin:${index === 0 ? 20 : 0}px 0 12px;color:${INK};font-size:15px;line-height:1.6;">${e(paragraph)}</p>`,
    )
    .join("");
  const bringHtml = bring.length
    ? `
      <p style="margin:24px 0 8px;color:${INK};font-size:15px;font-weight:600;">Please bring</p>
      <ul style="margin:0;padding-left:20px;color:${INK};font-size:15px;line-height:1.6;">
        ${bring.map((item) => `<li>${e(item)}</li>`).join("")}
      </ul>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 16px;color:${INK};font-size:16px;font-weight:700;letter-spacing:0.02em;">${e(BRAND_NAME)}</td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:28px 24px;">
            <h1 style="margin:0 0 16px;color:${INK};font-size:22px;line-height:1.3;">${e(copy.heading)}</h1>
            <p style="margin:0 0 12px;color:${INK};font-size:15px;line-height:1.6;">${e(greeting)}</p>
            ${copy.paragraphs
              .map(
                (paragraph) =>
                  `<p style="margin:0 0 12px;color:${INK};font-size:15px;line-height:1.6;">${e(paragraph)}</p>`,
              )
              .join("")}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-bottom:1px solid ${LINE};">
              ${rowHtml}
            </table>
            ${billHtml}
            ${closingHtml}
            ${bringHtml}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td style="border-radius:8px;background:${ACTION};">
                  <a href="${e(bookingUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View your booking</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 4px 0;color:${MUTED};font-size:13px;line-height:1.6;">
            ${contact.length ? `Questions? Reply to this email or reach us at ${contact.map(e).join(" · ")}.<br>` : ""}
            ${e(BRAND_NAME)}${address ? ` · ${e(address)}` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject: copy.subject, html, text };
}
