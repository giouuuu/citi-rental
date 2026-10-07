import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";

import { StatusBadge } from "@/components/design-system/status-badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import {
  formatDateKey,
  formatManila,
  parseDateKey,
} from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
import type {
  ResourceColumn,
  ResourceRow,
} from "@/features/shared/types/resource";

const columnHelper = createColumnHelper<ResourceRow>();

function displayValue(value: unknown, format = "text") {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "boolean") return value ? "Yes" : "No";
  if (format === "money") return formatPhpExact(Number(value));
  if (format === "date" || format === "datetime") {
    const text = String(value);
    // A bare `YYYY-MM-DD` is already a Philippine calendar day.
    const key = parseDateKey(text);
    if (key) return formatDateKey(key);
    if (Number.isNaN(new Date(text).getTime())) return text;
    return formatManila(text, format === "datetime" ? "stamp" : "date");
  }
  return String(value).replaceAll("_", " ");
}

export function buildResourceColumns({
  columns,
  route,
  singular,
  titleField,
}: {
  columns: ResourceColumn[];
  route: string;
  singular: string;
  titleField: string;
}) {
  return [
    ...columns.map((column) =>
      columnHelper.accessor((row) => row[column.key], {
        id: column.key,
        size: column.format === "image" ? 88 : undefined,
        enableSorting: column.format !== "image",
        header: ({ column: tableColumn }) => (
          <DataTableColumnHeader column={tableColumn} title={column.label} />
        ),
        cell: (context) =>
          column.format === "status" ? (
            <StatusBadge status={String(context.getValue() ?? "unknown")} />
          ) : column.format === "image" ? (
            context.getValue() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="h-10 w-14 rounded-md border object-cover"
                src={String(context.getValue())}
              />
            ) : (
              <span className="text-muted-foreground">No photo</span>
            )
          ) : (
            <span
              className={
                column.format === "number" || column.format === "money"
                  ? "font-mono tabular-nums"
                  : undefined
              }
            >
              {displayValue(context.getValue(), column.format)}
            </span>
          ),
      }),
    ),
    columnHelper.display({
      id: "open",
      size: 48,
      enableHiding: false,
      cell: ({ row }) => (
        <Button asChild size="icon-sm" variant="ghost">
          <Link
            aria-label={`Open ${String(row.original[titleField] ?? singular)}`}
            href={`${route}/${row.original.id}`}
          >
            <ArrowRight />
          </Link>
        </Button>
      ),
    }),
  ];
}
