import ExcelJS from "exceljs";

import { parseDateKey } from "@/features/shared/lib/manila-time";
import type { ResourceColumn } from "@/features/shared/types/resource";

export type XlsxColumn = {
  key: string;
  header: string;
  format?: ResourceColumn["format"] | "percent";
};

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const NUMBER_FORMATS: Partial<Record<NonNullable<XlsxColumn["format"]>, string>> = {
  money: '"₱"#,##0.00',
  number: "#,##0.##",
  percent: "0.00%",
  date: "mmm d, yyyy",
  datetime: "mmm d, yyyy h:mm AM/PM",
};

function humanize(text: string) {
  const spaced = text.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Excel has no time zones, so a timestamp is written as its Philippine
 * wall-clock time and a bare `YYYY-MM-DD` as that calendar day.
 */
function toExcelDate(value: unknown): Date | null {
  const text = String(value);
  const key = parseDateKey(text);
  if (key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const time = new Date(text).getTime();
  return Number.isNaN(time) ? null : new Date(time + MANILA_OFFSET_MS);
}

/** One cell as Excel should store it: numbers and dates stay typed so sums and sorts work. */
export function xlsxCellValue(value: unknown, format: XlsxColumn["format"] = "text"): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  switch (format) {
    case "money":
    case "number":
    case "percent": {
      const number = Number(value);
      return Number.isFinite(number) ? number : String(value);
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
    case "datetime":
      return toExcelDate(value) ?? String(value);
    case "status":
      return humanize(String(value));
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

function sheetName(name: string, taken: Set<string>) {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Renders one or more tables as an .xlsx workbook. Headers are bold and frozen
 * with an autofilter; image columns are dropped since a cell can't hold them.
 */
export async function toXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const taken = new Set<string>();

  for (const sheet of sheets) {
    const columns = sheet.columns.filter((column) => column.format !== "image");
    const worksheet = workbook.addWorksheet(sheetName(sheet.name, taken), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    worksheet.columns = columns.map((column) => ({
      key: column.key,
      header: column.header,
      style: NUMBER_FORMATS[column.format ?? "text"]
        ? { numFmt: NUMBER_FORMATS[column.format ?? "text"] }
        : {},
    }));
    for (const row of sheet.rows) {
      worksheet.addRow(
        Object.fromEntries(
          columns.map((column) => [column.key, xlsxCellValue(row[column.key], column.format)]),
        ),
      );
    }

    worksheet.getRow(1).font = { bold: true };
    if (columns.length) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };
    }
    worksheet.columns.forEach((column, index) => {
      const spec = columns[index];
      const longest = sheet.rows.reduce((max, row) => {
        const value = row[spec.key];
        return Math.max(max, value == null ? 0 : String(value).length);
      }, spec.header.length);
      const floor = spec.format === "datetime" ? 20 : spec.format === "date" ? 14 : 8;
      column.width = Math.min(Math.max(longest + 2, floor), 50);
    });
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** `<name>-<YYYY-MM-DD>.xlsx`, dated in Philippine time. */
export function xlsxFileName(name: string) {
  const day = new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  return `${name}-${day}.xlsx`;
}

/** A download response for a workbook, named `<name>-<YYYY-MM-DD>.xlsx`. */
export function xlsxResponse(workbook: Uint8Array, name: string) {
  return new Response(workbook as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${xlsxFileName(name)}"`,
      "cache-control": "no-store",
    },
  });
}
