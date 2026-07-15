import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";

import { StatusBadge } from "@/components/design-system/status-badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import type {
  ResourceColumn,
  ResourceRow,
} from "@/features/shared/types/resource";

const columnHelper = createColumnHelper<ResourceRow>();

function displayValue(value: unknown, format = "text") {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "boolean") return value ? "Yes" : "No";
  if (format === "date" || format === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      ...(format === "datetime"
        ? { timeStyle: "short", timeZone: "Asia/Manila" }
        : {}),
    }).format(date);
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
        header: ({ column: tableColumn }) => (
          <DataTableColumnHeader column={tableColumn} title={column.label} />
        ),
        cell: (context) =>
          column.format === "status" ? (
            <StatusBadge status={String(context.getValue() ?? "unknown")} />
          ) : (
            <span
              className={
                column.format === "number"
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
