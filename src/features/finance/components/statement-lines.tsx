import type { ReactNode } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatPhpExact } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";

export type StatementLine = {
  label: ReactNode;
  amount: number | null;
  /** Where the rows behind this figure live. */
  href?: string;
  kind?: "item" | "subtotal" | "total";
  indent?: boolean;
  /** Shown as (1,234.00): a deduction from the line above. */
  negative?: boolean;
  note?: string;
};

/** Two-column statement: label left, centavo-exact amount right. */
export function StatementLines({ lines, label }: { lines: StatementLine[]; label: string }) {
  return (
    <Table aria-label={label}>
      <TableBody>
        {lines.map((line, index) => (
          <TableRow
            className={cn(
              "hover:bg-transparent",
              line.kind === "subtotal" && "border-t font-medium",
              line.kind === "total" && "border-t-2 border-foreground/20 font-semibold",
            )}
            key={index}
          >
            <TableCell className={cn("whitespace-normal", line.indent && "pl-8 text-muted-foreground")}>
              {line.href ? (
                <Link className="underline-offset-4 hover:underline" href={line.href}>
                  {line.label}
                </Link>
              ) : (
                line.label
              )}
              {line.note ? (
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{line.note}</span>
              ) : null}
            </TableCell>
            <TableCell className="w-44 text-right align-top font-mono tabular-nums">
              {line.amount === null
                ? "—"
                : line.negative
                  ? `(${formatPhpExact(line.amount)})`
                  : formatPhpExact(line.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Right-aligned money cell for multi-column tables. */
export function MoneyCell({ value, className }: { value: number; className?: string }) {
  return (
    <TableCell className={cn("text-right font-mono tabular-nums", value === 0 && "text-muted-foreground", className)}>
      {formatPhpExact(value)}
    </TableCell>
  );
}
