import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import type { XlsxColumn } from "@/features/shared/lib/to-xlsx";

/**
 * The accessible twin of a chart: the same rows as a table, collapsed by
 * default so it costs no space until someone asks for it.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
  exportFileName,
  exportFormats,
}: {
  caption: string;
  columns: string[];
  /** `raw` carries the unformatted values for the Excel export, one per column. */
  rows: { key: string; cells: string[]; raw?: unknown[] }[];
  /** Adds an "Export to Excel" button; the file is `<exportFileName>-<date>.xlsx`. */
  exportFileName?: string;
  /** Excel format per column (defaults to text). */
  exportFormats?: XlsxColumn["format"][];
}) {
  const table = (
    <details className="group min-w-0 flex-1 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Show data table
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead className={index ? "text-right" : undefined} key={column}>
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {row.cells.map((cell, index) => (
                  <TableCell className={index ? "text-right tabular-nums" : undefined} key={index}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
  if (!exportFileName) return table;

  const sheet = {
    name: caption.slice(0, 31),
    columns: columns.map((header, index) => ({
      key: `c${index}`,
      header,
      format: exportFormats?.[index] ?? "text",
    })),
    rows: rows.map((row) =>
      Object.fromEntries(columns.map((_, index) => [`c${index}`, row.raw?.[index] ?? row.cells[index]])),
    ),
  };
  return (
    <div className="flex items-start justify-between gap-2">
      {table}
      <ExportRowsButton fileName={exportFileName} sheets={[sheet]} />
    </div>
  );
}
