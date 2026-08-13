function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Renders rows as CSV, taking the column set from the first row.
 * Every cell is quoted, so embedded commas and newlines are safe.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}
