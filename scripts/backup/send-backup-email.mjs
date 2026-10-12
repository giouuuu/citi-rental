// Emails the nightly backup through Resend.
//
//   node scripts/backup/send-backup-email.mjs ok <archive.7z> <summary.json>
//   node scripts/backup/send-backup-email.mjs failed <run-url>
//
// Env: RESEND_API_KEY, BACKUP_EMAIL_TO (comma-separated), EMAIL_FROM (optional).
// BACKUP_DRY_RUN=1 prints what would be sent instead of sending it.
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

/** Gmail takes 25 MB, and base64 adds a third: stay well under it. */
const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const FROM =
  process.env.EMAIL_FROM?.trim() ||
  "Zeke Car Rental & Services <no-reply@zekecebucarrental.com>";

const [mode, ...args] = process.argv.slice(2);
const to = (process.env.BACKUP_EMAIL_TO ?? "")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);
if (!to.length) {
  console.error("BACKUP_EMAIL_TO is empty");
  process.exit(1);
}

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const megabytes = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

let email;
if (mode === "ok") {
  const [archive, summaryPath] = args;
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const size = statSync(archive).size;
  const attach = size <= MAX_ATTACHMENT_BYTES;
  const counts = Object.entries(summary.sheets).map(([sheet, count]) => `${sheet}: ${count}`);
  const lines = [
    `Last night's backup of the Zeke Car Rental system (${summary.day}) is ${attach ? "attached" : "ready"}.`,
    "",
    ...counts,
    ...(summary.missing.length
      ? ["", `Not in the Excel file: ${summary.missing.map((m) => m.sheet).join(", ")} (the database copy still has them).`]
      : []),
    "",
    attach
      ? `${basename(archive)} (${megabytes(size)}) is locked with the backup password. Open it with Keka or The Unarchiver (Mac) or 7-Zip (Windows).`
      : `The file is ${megabytes(size)}, too big to email. Download it from the GitHub run under Artifacts, and plan to move backups to Google Drive.`,
    "Inside: zeke-records (Excel, to read) and database/ (SQL, to restore the system).",
  ];
  email = {
    subject: `${attach ? "✅" : "⚠️"} Zeke backup · ${summary.day} · ${megabytes(size)}`,
    text: lines.join("\n"),
    html: lines.map((line) => (line ? `<p style="margin:0 0 8px">${escape(line)}</p>` : "")).join(""),
    attachments: attach
      ? [{ filename: basename(archive), content: readFileSync(archive).toString("base64") }]
      : undefined,
  };
} else if (mode === "failed") {
  const [runUrl] = args;
  const lines = [
    "Last night's backup of the Zeke Car Rental system did not finish, so no copy was made.",
    "",
    `See what went wrong: ${runUrl}`,
    "Re-run it from that page once it is fixed.",
  ];
  email = {
    subject: "❌ Zeke backup failed",
    text: lines.join("\n"),
    html: lines.map((line) => (line ? `<p style="margin:0 0 8px">${escape(line)}</p>` : "")).join(""),
  };
} else {
  console.error("Usage: send-backup-email.mjs ok <archive> <summary.json> | failed <run-url>");
  process.exit(1);
}

const payload = { from: FROM, to, ...email };
if (process.env.BACKUP_DRY_RUN === "1") {
  console.log(JSON.stringify({ ...payload, attachments: payload.attachments?.map((a) => ({ filename: a.filename, base64Length: a.content.length })) }, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error("Resend rejected the backup email", response.status, body);
  process.exit(1);
}
console.log("Backup email sent", body?.id);
