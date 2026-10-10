import Link from "next/link";
import { ArrowRight, FileSearch } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";

import { StatusBadge } from "@/components/design-system/status-badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatDateKey,
  formatManila,
  parseDateKey,
} from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
import type {
  ResourceColumn,
  ResourceRow,
  ResourceRowLink,
} from "@/features/shared/types/resource";
import { cn } from "@/lib/utils";

const columnHelper = createColumnHelper<ResourceRow>();

const ROW_LINK_ICONS = { agreement: FileSearch } as const;

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
  selectable = false,
  rowLinks = [],
}: {
  columns: ResourceColumn[];
  route: string;
  singular: string;
  titleField: string;
  /** Lead with a checkbox column for bulk actions. */
  selectable?: boolean;
  rowLinks?: ResourceRowLink[];
}) {
  return [
    ...(selectable
      ? [
          columnHelper.display({
            id: "select",
            size: 40,
            enableHiding: false,
            enableSorting: false,
            header: ({ table }) => (
              <Checkbox
                aria-label="Select all rows on this page"
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label={`Select ${String(row.original[titleField] ?? singular)}`}
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(value === true)}
              />
            ),
          }),
        ]
      : []),
    ...columns
      .filter((column) => !column.exportOnly)
      .map((column) =>
        columnHelper.accessor((row) => row[column.key], {
          id: column.key,
          size: column.format === "image" ? 88 : undefined,
          enableSorting: column.format !== "image",
          header: ({ column: tableColumn }) => (
            <DataTableColumnHeader column={tableColumn} title={column.label} />
          ),
          cell: (context) =>
            column.secondary?.length ? (
              <div className="flex flex-col items-start gap-0.5">
                <CellValue column={column} value={context.getValue()} />
                {column.secondary.map((line) => (
                  <CellValue
                    column={line}
                    key={line.key}
                    secondary
                    value={context.row.original[line.key]}
                  />
                ))}
              </div>
            ) : (
              <CellValue column={column} value={context.getValue()} />
            ),
        }),
      ),
    columnHelper.display({
      id: "open",
      size: 48 + rowLinks.length * 36,
      enableHiding: false,
      cell: ({ row }) => {
        const title = String(row.original[titleField] ?? singular);
        const href = `${route}/${row.original.id}`;
        return (
          <div className="flex items-center justify-end gap-1">
            {rowLinks.map((link) => {
              const Icon = ROW_LINK_ICONS[link.icon];
              return (
                <Button asChild key={link.path} size="icon-sm" variant="ghost">
                  <Link
                    aria-label={`${link.label} for ${title}`}
                    href={`${href}${link.path}`}
                    rel={link.newTab ? "noreferrer" : undefined}
                    target={link.newTab ? "_blank" : undefined}
                    title={link.label}
                  >
                    <Icon />
                  </Link>
                </Button>
              );
            })}
            <Button asChild size="icon-sm" variant="ghost">
              <Link aria-label={`Open ${title}`} href={href}>
                <ArrowRight />
              </Link>
            </Button>
          </div>
        );
      },
    }),
  ];
}

function CellValue({
  column,
  value,
  secondary = false,
}: {
  column: ResourceColumn;
  value: unknown;
  /** A smaller, muted line under the cell's main value. */
  secondary?: boolean;
}) {
  if (column.format === "status")
    return value ? (
      <StatusBadge
        className={secondary ? "h-5 px-2 text-[11px]" : undefined}
        status={String(value)}
      />
    ) : secondary ? null : (
      <StatusBadge status="unknown" />
    );
  // A yes/no line under a value is a tag when it applies, and nothing when it
  // does not, so a rare flag does not print "No" on every row.
  if (secondary && column.format === "boolean")
    return value === true ? (
      <Badge className="h-5 px-2 text-[11px]" variant="secondary">
        {column.label}
      </Badge>
    ) : null;
  if (column.format === "image")
    return value ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="h-10 w-14 rounded-md border object-cover"
        src={String(value)}
      />
    ) : (
      <span className="text-muted-foreground">No photo</span>
    );
  const numeric = column.format === "number" || column.format === "money";
  return (
    <span
      className={cn(
        numeric && "font-mono tabular-nums",
        secondary && "text-xs text-muted-foreground",
      )}
    >
      {secondary && column.prefix ? `${column.prefix} ` : null}
      {displayValue(value, column.format)}
    </span>
  );
}
