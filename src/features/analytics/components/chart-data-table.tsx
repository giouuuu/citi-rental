import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The accessible twin of a chart: the same rows as a table, collapsed by
 * default so it costs no space until someone asks for it.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <details className="group text-sm">
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
}
