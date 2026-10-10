/**
 * The PDF attached to the release and return emails:
 *
 *   rental_released   the signed rental agreement + the pickup condition report
 *   rental_completed  the condition report comparing pickup and return, with
 *                     the charges
 *
 * Mirrors the printable agreement and condition report in the ops app. Built
 * with pdf-lib so it runs in the Edge Function (Deno) and in vitest (Node,
 * through an alias for the npm: specifier).
 */

import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  rgb,
} from "npm:pdf-lib@1.17.1";

import { BRAND_NAME, formatPeso, formatWhen } from "./templates.ts";

export type DocumentEmailKind = "rental_released" | "rental_completed";

/** The agreement terms as frozen on rental_agreements.terms. */
export type AgreementTerms = {
  title: string;
  intro: string;
  clauses: string[];
  penalties: { heading: string; items: string[] };
  fines: { label: string; amount: number }[];
  otherCharges: { label: string; detail: string }[];
  prohibitedUse: { intro: string; items: string[]; closing: string };
  reminders: { label: string; text: string }[];
  acknowledgement: string;
  cancellation: {
    title: string;
    intro: string;
    sections: { heading: string; body: string }[];
    closing: string;
  };
};

export type EmailAgreement = {
  terms: AgreementTerms;
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companySignaturePath: string | null;
  renterName: string;
  renterLicenseNumber: string | null;
  renterAddress: string | null;
  renterSignaturePath: string | null;
  rentalReference: string | null;
  vehicleLabel: string | null;
  plateNumber: string | null;
  startAt: string | null;
  expectedReturnAt: string | null;
  signedAt: string;
};

export type EmailInspectionItem = {
  areaCode: string;
  label: string;
  status: string;
  severity: number | null;
  notes: string | null;
};

export type EmailInspection = {
  type: "pickup" | "return";
  inspectedAt: string;
  odometer: number | string;
  fuelLevel: number | string;
  cleanliness: string;
  odor: string;
  notes: string | null;
  fuelChargeAmount: number | string | null;
  fuelChargeNote: string | null;
  damageChargeAmount: number | string | null;
  damageChargeNote: string | null;
  customerSignaturePath: string | null;
  customerAcknowledgedAt: string | null;
  mediaCount: number;
  items: EmailInspectionItem[];
};

export type EmailDocuments = {
  agreement: EmailAgreement | null;
  inspections: EmailInspection[];
};

export type DocumentInput = {
  kind: DocumentEmailKind;
  documents: EmailDocuments;
  referenceNumber: string | null;
  customerName: string | null;
  vehicleName: string | null;
  plateNumber: string | null;
  startAt: string;
  returnAt: string;
  company: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    timezone: string | null;
  };
  /** Signature PNGs by storage path; missing ones print as a blank line. */
  signatures: Map<string, Uint8Array>;
  /** Where the customer can see the photos and videos. */
  reportUrl: string;
};

/** Every storage path the PDF wants to draw. */
export function signaturePaths(documents: EmailDocuments): string[] {
  const paths = [
    documents.agreement?.companySignaturePath,
    documents.agreement?.renterSignaturePath,
    ...documents.inspections.map((inspection) => inspection.customerSignaturePath),
  ];
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

export function documentFilename(kind: DocumentEmailKind, reference: string | null) {
  const ref = (reference ?? "").replace(/[^A-Za-z0-9-]/g, "");
  const name =
    kind === "rental_released"
      ? "Rental-agreement-and-pickup-report"
      : "Return-condition-report";
  return `${name}${ref ? `-${ref}` : ""}.pdf`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  scratch: "Scratch",
  dent: "Dent",
  chip: "Chip",
  crack: "Crack",
  missing: "Missing",
  dirty: "Dirty",
  damaged: "Damaged",
  other: "Other",
};

function statusLabel(status: string | null | undefined) {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

function words(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function amount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function km(value: number | string) {
  return `${Number(value).toLocaleString("en-US")} km`;
}

// The standard PDF fonts only cover Windows-1252, which has no peso sign.
const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

/** Text the standard fonts can draw: ₱ becomes "PHP ", anything else unknown "?". */
export function pdfText(value: string): string {
  return value
    .replace(/₱\s?/g, "PHP ")
    .replace(/[‐‑‒]/g, "-")
    .replace(/→/g, "->")
    .replace(/[  ]/g, " ")
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/g, (char) => (WIN_ANSI_EXTRAS.has(char) ? char : "?"));
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfText(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the line is broken by character.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FOOTER_SPACE = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.043, 0.09, 0.157);
const MUTED = rgb(0.357, 0.42, 0.498);
const LINE = rgb(0.85, 0.88, 0.91);
const SURFACE = rgb(0.945, 0.965, 0.976);
const WARN = rgb(0.71, 0.2, 0.11);
const WARN_SURFACE = rgb(0.996, 0.949, 0.933);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };
type TextStyle = {
  size?: number;
  font?: keyof Fonts;
  color?: ReturnType<typeof rgb>;
  indent?: number;
  width?: number;
  align?: "left" | "center" | "right";
  gap?: number;
};

class Layout {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Start a new page unless `height` still fits on this one. */
  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.newPage();
  }

  space(height: number) {
    this.y -= height;
  }

  text(value: string, style: TextStyle = {}) {
    const size = style.size ?? 10;
    const font = this.fonts[style.font ?? "regular"];
    const indent = style.indent ?? 0;
    const width = style.width ?? CONTENT_WIDTH - indent;
    const leading = size * 1.4;
    for (const line of wrap(value, font, size, width)) {
      this.ensure(leading);
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x =
        MARGIN +
        indent +
        (style.align === "center"
          ? (width - lineWidth) / 2
          : style.align === "right"
            ? width - lineWidth
            : 0);
      this.page.drawText(line, {
        x,
        y: this.y - size,
        size,
        font,
        color: style.color ?? INK,
      });
      this.y -= leading;
    }
    this.y -= style.gap ?? 4;
  }

  heading(value: string, size = 11, keepWith = 72) {
    // Never leave a heading alone at the foot of a page.
    this.ensure(size * 3 + keepWith);
    this.space(4);
    this.text(value.toUpperCase(), { size, font: "bold", gap: 4 });
  }

  bullets(items: string[], { numbered = false }: { numbered?: boolean } = {}) {
    items.forEach((item, index) => {
      const marker = numbered ? `${index + 1}.` : "•";
      this.ensure(14);
      this.page.drawText(marker, {
        x: MARGIN + 4,
        y: this.y - 10,
        size: 10,
        font: this.fonts.regular,
        color: INK,
      });
      this.text(item, { indent: 18, gap: 3 });
    });
    this.y -= 3;
  }

  rule(color = LINE) {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color,
    });
    this.y -= 8;
  }

  /** Label/value pairs in a shaded box, two to a row. */
  facts(rows: Array<[string, string]>) {
    const columnWidth = CONTENT_WIDTH / 2 - 16;
    const pairs: Array<Array<[string, string]>> = [];
    for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
    const rowHeights = pairs.map((pair) =>
      Math.max(
        ...pair.map(
          ([, value]) =>
            18 + wrap(value, this.fonts.bold, 10, columnWidth).length * 14,
        ),
      ),
    );
    const height = rowHeights.reduce((sum, h) => sum + h, 0) + 16;
    this.ensure(height);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: CONTENT_WIDTH,
      height,
      color: SURFACE,
    });
    let top = this.y - 8;
    pairs.forEach((pair, rowIndex) => {
      pair.forEach(([label, value], column) => {
        const x = MARGIN + 12 + column * (CONTENT_WIDTH / 2);
        this.page.drawText(pdfText(label), {
          x,
          y: top - 9,
          size: 8,
          font: this.fonts.regular,
          color: MUTED,
        });
        wrap(value, this.fonts.bold, 10, columnWidth).forEach((line, index) => {
          this.page.drawText(line, {
            x,
            y: top - 23 - index * 14,
            size: 10,
            font: this.fonts.bold,
            color: INK,
          });
        });
      });
      top -= rowHeights[rowIndex]!;
    });
    this.y -= height + 10;
  }

  /** A simple table; rows flagged `highlight` are shaded and bold. */
  table(
    columns: Array<{ header: string; width: number; align?: "left" | "right" }>,
    rows: Array<{ cells: string[]; highlight?: boolean }>,
  ) {
    const size = 9;
    const pad = 5;
    const units = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => (column.width / units) * CONTENT_WIDTH);

    const measure = (cells: string[], bold: boolean) => {
      const font = bold ? this.fonts.bold : this.fonts.regular;
      const wrapped = cells.map((cell, index) =>
        wrap(cell || "—", font, size, widths[index]! - pad * 2),
      );
      const height = Math.max(...wrapped.map((lines) => lines.length)) * size * 1.35 + pad * 2;
      return { font, wrapped, height };
    };

    const drawRow = (cells: string[], options: { header?: boolean; highlight?: boolean }) => {
      const { font, wrapped, height } = measure(
        cells,
        Boolean(options.header || options.highlight),
      );
      if (this.y - height < MARGIN + FOOTER_SPACE) {
        this.newPage();
        if (!options.header) drawRow(columns.map((column) => column.header), { header: true });
      }
      if (options.header || options.highlight) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - height,
          width: CONTENT_WIDTH,
          height,
          color: options.header ? SURFACE : WARN_SURFACE,
        });
      }
      let x = MARGIN;
      wrapped.forEach((lines, index) => {
        const align = columns[index]!.align ?? "left";
        lines.forEach((line, lineIndex) => {
          const lineWidth = font.widthOfTextAtSize(line, size);
          this.page.drawText(line, {
            x: align === "right" ? x + widths[index]! - pad - lineWidth : x + pad,
            y: this.y - pad - size - lineIndex * size * 1.35 + 1,
            size,
            font,
            color: options.header ? MUTED : options.highlight ? WARN : INK,
          });
        });
        x += widths[index]!;
      });
      this.y -= height;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_WIDTH - MARGIN, y: this.y },
        thickness: 0.5,
        color: LINE,
      });
    };

    // A table that fits on one page is never split.
    const total =
      measure(columns.map((column) => column.header), true).height +
      rows.reduce((sum, row) => sum + measure(row.cells, Boolean(row.highlight)).height, 0);
    const pageRoom = PAGE_HEIGHT - MARGIN * 2 - FOOTER_SPACE;
    this.ensure(total <= pageRoom ? total : 40);
    drawRow(columns.map((column) => column.header), { header: true });
    for (const row of rows) drawRow(row.cells, { highlight: row.highlight });
    this.y -= 10;
  }

  /**
   * Signature blocks side by side: the ink over a line, the printed name,
   * then details.
   */
  signatures(
    blocks: Array<{
      title: string;
      name: string;
      image: PDFImage | null;
      placeholder: string;
      details: Array<[string, string]>;
    }>,
  ) {
    const gutter = 30;
    // A lone block keeps half the width, like one column of a pair.
    const columns = Math.max(2, blocks.length);
    const width = (CONTENT_WIDTH - gutter * (columns - 1)) / columns;
    const inkHeight = 56;
    const detailsHeight =
      Math.max(...blocks.map((block) => block.details.length)) * 26;
    this.ensure(14 + inkHeight + 34 + detailsHeight + 8);
    const top = this.y;

    blocks.forEach((block, index) => {
      const x = MARGIN + index * (width + gutter);
      let y = top;
      this.page.drawText(pdfText(block.title.toUpperCase()), {
        x,
        y: y - 8,
        size: 8,
        font: this.fonts.bold,
        color: MUTED,
      });
      y -= 14;
      const lineY = y - inkHeight;
      if (block.image) {
        const scale = Math.min(
          (width - 10) / block.image.width,
          (inkHeight - 4) / block.image.height,
        );
        const w = block.image.width * scale;
        const h = block.image.height * scale;
        this.page.drawImage(block.image, {
          x: x + (width - w) / 2,
          y: lineY + 2,
          width: w,
          height: h,
        });
      } else {
        const placeholder = pdfText(block.placeholder);
        this.page.drawText(placeholder, {
          x: x + (width - this.fonts.italic.widthOfTextAtSize(placeholder, 8)) / 2,
          y: lineY + 4,
          size: 8,
          font: this.fonts.italic,
          color: MUTED,
        });
      }
      this.page.drawLine({
        start: { x, y: lineY },
        end: { x: x + width, y: lineY },
        thickness: 0.75,
        color: INK,
      });
      const name = wrap((block.name || "—").toUpperCase(), this.fonts.bold, 9, width)[0]!;
      this.page.drawText(name, {
        x: x + (width - this.fonts.bold.widthOfTextAtSize(name, 9)) / 2,
        y: lineY - 13,
        size: 9,
        font: this.fonts.bold,
        color: INK,
      });
      const caption = "Signature over printed name";
      this.page.drawText(caption, {
        x: x + (width - this.fonts.regular.widthOfTextAtSize(caption, 7)) / 2,
        y: lineY - 23,
        size: 7,
        font: this.fonts.regular,
        color: MUTED,
      });
      y = lineY - 34;
      for (const [label, value] of block.details) {
        this.page.drawText(pdfText(label), {
          x,
          y: y - 7,
          size: 7,
          font: this.fonts.regular,
          color: MUTED,
        });
        const line = wrap(value || "—", this.fonts.regular, 9, width)[0]!;
        this.page.drawText(line, {
          x,
          y: y - 19,
          size: 9,
          font: this.fonts.regular,
          color: INK,
        });
        y -= 26;
      }
    });
    this.y = top - (14 + inkHeight + 34 + detailsHeight) - 8;
  }

  footer(label: string) {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      const text = pdfText(`${label} · Page ${index + 1} of ${pages.length}`);
      page.drawLine({
        start: { x: MARGIN, y: MARGIN - 4 },
        end: { x: PAGE_WIDTH - MARGIN, y: MARGIN - 4 },
        thickness: 0.5,
        color: LINE,
      });
      page.drawText(text, {
        x: MARGIN,
        y: MARGIN - 16,
        size: 7.5,
        font: this.fonts.regular,
        color: MUTED,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

type Context = {
  input: DocumentInput;
  layout: Layout;
  timeZone: string;
  images: Map<string, PDFImage>;
};

function when(context: Context, iso: string | null | undefined) {
  return iso ? formatWhen(iso, context.timeZone) : "—";
}

function image(context: Context, path: string | null | undefined) {
  return path ? (context.images.get(path) ?? null) : null;
}

function companyHeader(context: Context) {
  const { layout, input } = context;
  const agreement = input.documents.agreement;
  const name = agreement?.companyName || input.company.name || BRAND_NAME;
  const address = agreement?.companyAddress ?? input.company.address;
  const phone = agreement?.companyPhone ?? input.company.phone;
  const email = agreement?.companyEmail ?? input.company.email;
  layout.text(name.toUpperCase(), { size: 15, font: "bold", align: "center", gap: 2 });
  for (const line of [
    address,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
  ]) {
    if (line) layout.text(line, { size: 8.5, color: MUTED, align: "center", gap: 0 });
  }
  layout.space(12);
}

function titleRow(context: Context, title: string) {
  const { layout, input } = context;
  layout.ensure(30);
  const top = layout.y;
  layout.text(title.toUpperCase(), { size: 13, font: "bold", gap: 2 });
  if (input.referenceNumber) {
    const ref = pdfText(`Ref. ${input.referenceNumber}`);
    layout.page.drawText(ref, {
      x: PAGE_WIDTH - MARGIN - layout.fonts.regular.widthOfTextAtSize(ref, 9),
      y: top - 12,
      size: 9,
      font: layout.fonts.regular,
      color: MUTED,
    });
  }
  layout.rule(INK);
}

function vehicleLabel(input: DocumentInput) {
  return [input.documents.agreement?.vehicleLabel ?? input.vehicleName, input.plateNumber]
    .filter(Boolean)
    .join(" · ") || "—";
}

function agreementSection(context: Context, agreement: EmailAgreement) {
  const { layout } = context;
  const { terms } = agreement;
  companyHeader(context);
  titleRow(context, terms.title);
  layout.facts([
    [
      "Vehicle",
      [agreement.vehicleLabel, agreement.plateNumber].filter(Boolean).join(" · ") || "—",
    ],
    [
      "Rental period",
      agreement.startAt && agreement.expectedReturnAt
        ? `${when(context, agreement.startAt)} – ${when(context, agreement.expectedReturnAt)}`
        : "—",
    ],
  ]);

  layout.text(terms.intro);
  layout.bullets(terms.clauses);

  layout.heading(terms.penalties.heading.length > 60 ? "Penalties" : terms.penalties.heading);
  if (terms.penalties.heading.length > 60) layout.text(terms.penalties.heading);
  layout.bullets(terms.penalties.items);

  layout.heading("Fines", 11, 30 + terms.fines.length * 22);
  layout.table(
    [
      { header: "Violation", width: 3 },
      { header: "Fine", width: 1, align: "right" },
    ],
    terms.fines.map((fine) => ({ cells: [fine.label, formatPeso(fine.amount)] })),
  );

  layout.heading("Other charges");
  layout.bullets(terms.otherCharges.map((charge) => `${charge.label}: ${charge.detail}`));

  layout.heading("Prohibited use");
  layout.text(terms.prohibitedUse.intro);
  layout.bullets(terms.prohibitedUse.items);
  layout.text(terms.prohibitedUse.closing);

  layout.heading("Additional reminders");
  layout.bullets(terms.reminders.map((reminder) => `${reminder.label}: ${reminder.text}`));

  // The acknowledgement and both signatures stay on one page.
  layout.heading("Acknowledgement", 11, 250);
  layout.text(terms.acknowledgement);
  layout.space(10);
  const signed = when(context, agreement.signedAt);
  layout.signatures([
    {
      title: "Car rental company",
      name: agreement.companyName,
      image: image(context, agreement.companySignaturePath),
      placeholder: "Company signature",
      details: [["Date", signed]],
    },
    {
      title: "Renter",
      name: agreement.renterName,
      image: image(context, agreement.renterSignaturePath),
      placeholder: "Renter signature",
      details: [
        ["Driver's license no.", agreement.renterLicenseNumber || "Not required (with driver)"],
        ["Address", agreement.renterAddress ?? "—"],
        ["Date", signed],
      ],
    },
  ]);

  layout.space(18);
  layout.ensure(180);
  layout.text(terms.cancellation.title.toUpperCase(), { size: 13, font: "bold", gap: 2 });
  layout.rule(INK);
  layout.text(terms.cancellation.intro);
  terms.cancellation.sections.forEach((section, index) => {
    layout.text(`${index + 1}. ${section.heading}`, { font: "bold", gap: 1 });
    layout.text(section.body, { indent: 12 });
  });
  layout.text(terms.cancellation.closing);
}

function readingsFacts(context: Context, inspection: EmailInspection) {
  context.layout.facts([
    ["Vehicle", vehicleLabel(context.input)],
    ["Inspected", when(context, inspection.inspectedAt)],
    ["Odometer", km(inspection.odometer)],
    ["Fuel level", `${Number(inspection.fuelLevel)}%`],
    ["Cleanliness", words(inspection.cleanliness)],
    ["Odor", words(inspection.odor)],
  ]);
}

function mediaNote(context: Context, count: number) {
  const { layout, input } = context;
  // The note and the signature below it stay on one page.
  layout.ensure(190);
  layout.space(6);
  layout.text(
    count > 0
      ? `${count} photo${count === 1 ? "" : "s"} and video${count === 1 ? "" : "s"} of the car are on file with this booking. View your condition report online: ${input.reportUrl}`
      : `View your condition report online: ${input.reportUrl}`,
    { size: 8.5, color: MUTED, gap: 8 },
  );
}

function customerSignOff(context: Context, inspection: EmailInspection, renterName: string) {
  const { layout } = context;
  layout.signatures([
    {
      title: "Customer",
      name: renterName,
      image: image(context, inspection.customerSignaturePath),
      placeholder: "Not signed",
      details: [
        [
          "Acknowledged",
          inspection.customerAcknowledgedAt
            ? when(context, inspection.customerAcknowledgedAt)
            : "Not acknowledged",
        ],
      ],
    },
  ]);
}

function pickupReportSection(context: Context, pickup: EmailInspection) {
  const { layout, input } = context;
  if (input.documents.agreement) layout.newPage();
  else companyHeader(context);
  titleRow(context, "Vehicle condition report — Pickup");
  readingsFacts(context, pickup);

  const issues = pickup.items.filter((item) => item.status !== "ok");
  const ok = pickup.items.filter((item) => item.status === "ok");
  layout.heading("Already marked at pickup");
  if (issues.length === 0) {
    layout.text("No marks: every checklist item was OK at pickup.");
  } else {
    layout.text("These were on the car before your rental. You are not charged for them.", {
      size: 9,
      color: MUTED,
    });
    layout.table(
      [
        { header: "Area", width: 3 },
        { header: "Condition", width: 1.4 },
        { header: "Notes", width: 3.6 },
      ],
      issues.map((item) => ({
        cells: [
          item.label,
          statusLabel(item.status),
          item.notes ?? "",
        ],
      })),
    );
  }
  if (ok.length > 0) {
    layout.heading("Checked and OK");
    layout.text(ok.map((item) => item.label).join(", "), { size: 9 });
  }

  if (pickup.notes) {
    layout.heading("Notes");
    layout.text(pickup.notes);
  }
  mediaNote(context, pickup.mediaCount);
  customerSignOff(
    context,
    pickup,
    input.documents.agreement?.renterName ?? input.customerName ?? "",
  );
}

function isNewDamage(pickup: EmailInspectionItem | undefined, item: EmailInspectionItem) {
  if (item.status === "ok") return false;
  return (
    !pickup ||
    pickup.status === "ok" ||
    pickup.status !== item.status ||
    (pickup.severity != null && item.severity != null && item.severity > pickup.severity)
  );
}

function returnReportSection(
  context: Context,
  pickup: EmailInspection | undefined,
  ret: EmailInspection,
) {
  const { layout, input } = context;
  companyHeader(context);
  titleRow(context, "Vehicle condition report — Return");
  layout.facts([
    ["Vehicle", vehicleLabel(input)],
    ["Returned", when(context, ret.inspectedAt)],
    ["Rental period", `${when(context, input.startAt)} – ${when(context, input.returnAt)}`],
    ["Renter", input.customerName ?? "—"],
  ]);

  layout.heading("Readings");
  const driven =
    pickup != null ? Number(ret.odometer) - Number(pickup.odometer) : null;
  layout.table(
    [
      { header: "Reading", width: 2 },
      { header: "Pickup", width: 2 },
      { header: "Return", width: 2 },
    ],
    [
      {
        cells: [
          "Odometer",
          pickup ? km(pickup.odometer) : "—",
          `${km(ret.odometer)}${driven != null && driven >= 0 ? ` (+${driven.toLocaleString("en-US")} km)` : ""}`,
        ],
      },
      {
        cells: ["Fuel level", pickup ? `${Number(pickup.fuelLevel)}%` : "—", `${Number(ret.fuelLevel)}%`],
        highlight: pickup != null && Number(ret.fuelLevel) < Number(pickup.fuelLevel),
      },
      { cells: ["Cleanliness", pickup ? words(pickup.cleanliness) : "—", words(ret.cleanliness)] },
      { cells: ["Odor", pickup ? words(pickup.odor) : "—", words(ret.odor)] },
    ],
  );

  const pickupByArea = new Map((pickup?.items ?? []).map((item) => [item.areaCode, item]));
  const okBoth = ret.items.filter(
    (item) => item.status === "ok" && (pickupByArea.get(item.areaCode)?.status ?? "ok") === "ok",
  );
  const marked = ret.items.filter((item) => !okBoth.includes(item));
  const rows = marked.map((item) => {
    const prior = pickupByArea.get(item.areaCode);
    const fresh = isNewDamage(prior, item);
    return {
      fresh,
      label: item.label,
      cells: [
        item.label,
        statusLabel(prior?.status),
        `${statusLabel(item.status)}${fresh ? " (new)" : ""}`,
        item.notes ?? "",
      ],
    };
  });
  const newDamage = rows.filter((row) => row.fresh);

  layout.heading("Checklist: pickup vs return");
  layout.text(
    newDamage.length === 0
      ? "No new damage was found at return."
      : `New damage at return (shaded): ${newDamage.map((row) => row.label).join(", ")}.`,
    { size: 9, color: newDamage.length ? WARN : MUTED },
  );
  if (rows.length > 0) {
    layout.table(
      [
        { header: "Area", width: 3 },
        { header: "Pickup", width: 1.5 },
        { header: "Return", width: 1.7 },
        { header: "Notes", width: 3 },
      ],
      rows.map((row) => ({ cells: row.cells, highlight: row.fresh })),
    );
  }
  if (okBoth.length > 0) {
    layout.heading("OK at pickup and return");
    layout.text(okBoth.map((item) => item.label).join(", "), { size: 9 });
  }

  const fuel = amount(ret.fuelChargeAmount);
  const damage = amount(ret.damageChargeAmount);
  layout.heading("Charges");
  if (fuel == null && damage == null) {
    layout.text("No fuel or damage charges.");
  } else {
    layout.table(
      [
        { header: "Charge", width: 2 },
        { header: "Note", width: 4 },
        { header: "Amount", width: 1.4, align: "right" },
      ],
      [
        ...(fuel != null
          ? [{ cells: ["Fuel shortfall", ret.fuelChargeNote ?? "", formatPeso(fuel)] }]
          : []),
        ...(damage != null
          ? [{ cells: ["Damage penalty", ret.damageChargeNote ?? "", formatPeso(damage)] }]
          : []),
        { cells: ["Total", "", formatPeso((fuel ?? 0) + (damage ?? 0))], highlight: true },
      ],
    );
  }

  if (ret.notes) {
    layout.heading("Notes");
    layout.text(ret.notes);
  }
  mediaNote(context, ret.mediaCount + (pickup?.mediaCount ?? 0));
  customerSignOff(context, ret, input.customerName ?? "");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function embedSignature(doc: PDFDocument, bytes: Uint8Array) {
  try {
    return await doc.embedPng(bytes);
  } catch {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

export async function buildRentalPdf(input: DocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title =
    input.kind === "rental_released"
      ? "Rental agreement and pickup condition report"
      : "Return condition report";
  doc.setTitle(`${title}${input.referenceNumber ? ` — ${input.referenceNumber}` : ""}`);
  doc.setAuthor(input.documents.agreement?.companyName ?? BRAND_NAME);
  doc.setCreator(BRAND_NAME);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const images = new Map<string, PDFImage>();
  for (const [path, bytes] of input.signatures) {
    const embedded = await embedSignature(doc, bytes);
    if (embedded) images.set(path, embedded);
  }

  const context: Context = {
    input,
    layout: new Layout(doc, fonts),
    timeZone: input.company.timezone?.trim() || "Asia/Manila",
    images,
  };
  const pickup = input.documents.inspections.find((row) => row.type === "pickup");
  const ret = input.documents.inspections.find((row) => row.type === "return");

  if (input.kind === "rental_released") {
    if (input.documents.agreement) agreementSection(context, input.documents.agreement);
    if (pickup) pickupReportSection(context, pickup);
  } else if (ret) {
    returnReportSection(context, pickup, ret);
  }

  context.layout.footer(
    [BRAND_NAME, input.referenceNumber ? `Ref. ${input.referenceNumber}` : null]
      .filter(Boolean)
      .join(" · "),
  );
  return await doc.save();
}
