// Builds the readable half of the nightly backup: one Excel workbook of the
// records the owner works with, plus summary.json for the email.
//
//   SUPABASE_DB_URL=postgres://… node scripts/backup/build-records.mjs <out-dir> <YYYY-MM-DD>
//
// Reads the database with psql (on the GitHub runner) as JSON, one query per
// sheet. A sheet whose table is missing is noted in summary.json instead of
// failing the whole backup: the SQL dump next to it is the real copy.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import ExcelJS from "exceljs";

const [outDir, day] = process.argv.slice(2);
const dbUrl = process.env.SUPABASE_DB_URL;
if (!outDir || !day || !dbUrl) {
  console.error("Usage: SUPABASE_DB_URL=… node build-records.mjs <out-dir> <YYYY-MM-DD>");
  process.exit(1);
}

const SHEETS = [
  {
    name: "Bookings",
    sql: `select r.reference_number as "Reference", c.full_name as "Customer",
        c.phone_number as "Phone", c.email as "Email", v.plate_number as "Plate",
        v.name as "Car", r.with_driver as "With driver", r.start_at as "Pick-up",
        r.expected_return_at as "Return", r.actual_return_at as "Returned",
        r.status as "Status", r.quoted_total as "Total",
        r.deposit_amount as "Reservation fee", r.balance_due as "Balance due",
        r.payment_status as "Payment", r.booking_source as "Source",
        r.created_at as "Created"
      from public.rentals r
      left join public.customers c on c.id = r.customer_id
      left join public.vehicles v on v.id = r.vehicle_id
      order by r.start_at desc`,
  },
  {
    name: "Payments",
    sql: `select r.reference_number as rental_reference, p.*
      from public.payments p
      left join public.rentals r on r.id = p.rental_id
      order by p.submitted_at desc`,
  },
  { name: "Customers", sql: `select * from public.customers order by created_at` },
  { name: "Fleet", sql: `select * from public.vehicles order by name, plate_number` },
  { name: "Expenses", sql: `select * from public.expenses order by created_at desc` },
  {
    name: "Vehicle expenses",
    sql: `select * from public.vehicle_expenses order by created_at desc`,
  },
  {
    name: "Charge types",
    sql: `select * from public.rental_charge_types order by sort_order, name`,
  },
];

/** One query's rows, as JSON straight from Postgres. */
function rows(sql) {
  const out = execFileSync(
    "psql",
    [dbUrl, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out.trim() || "[]");
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Timestamps become Excel dates in Manila time; objects become JSON text. */
function cell(value) {
  if (value == null) return null;
  if (typeof value === "string" && TIMESTAMP.test(value)) {
    // Excel has no time zones: store Manila wall-clock time as if it were UTC.
    return new Date(new Date(value).getTime() + MANILA_OFFSET_MS);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

const workbook = new ExcelJS.Workbook();
workbook.creator = "Zeke nightly backup";
workbook.created = new Date();
const summary = { day, sheets: {}, missing: [] };

for (const sheet of SHEETS) {
  let data;
  try {
    data = rows(sheet.sql);
  } catch (error) {
    const reason = String(error.stderr || error.message).trim().split("\n")[0];
    console.warn(`Skipped ${sheet.name}: ${reason}`);
    summary.missing.push({ sheet: sheet.name, reason });
    continue;
  }
  summary.sheets[sheet.name] = data.length;

  const ws = workbook.addWorksheet(sheet.name);
  const keys = data.length ? Object.keys(data[0]) : ["(no rows)"];
  ws.columns = keys.map((key) => ({ header: key, key, width: Math.min(40, Math.max(12, key.length + 2)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of data) {
    ws.addRow(Object.fromEntries(keys.map((key) => [key, cell(row[key])])));
  }
  ws.columns.forEach((column) => {
    const sample = data.find((row) => row[column.key] != null)?.[column.key];
    if (typeof sample === "string" && TIMESTAMP.test(sample)) {
      column.numFmt = "yyyy-mm-dd hh:mm";
      column.width = 18;
    }
  });
}

mkdirSync(outDir, { recursive: true });
const file = join(outDir, `zeke-records-${day}.xlsx`);
await workbook.xlsx.writeFile(file);
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`Wrote ${file}`, summary);
