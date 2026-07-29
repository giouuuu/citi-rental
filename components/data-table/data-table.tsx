"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Search, Settings2 } from "lucide-react";

import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterKey?: string;
  filterPlaceholder?: string;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
  className?: string;
  controlledSorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manual?: boolean;
  pagination?: React.ReactNode | false;
  isPending?: boolean;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  filterKey,
  filterPlaceholder = "Search records...",
  emptyMessage = "No records found.",
  toolbar,
  className,
  controlledSorting,
  onSortingChange,
  manual = false,
  pagination,
  isPending = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // TanStack Table intentionally exposes stateful functions that React Compiler skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manual ? undefined : getPaginationRowModel(),
    getSortedRowModel: manual ? undefined : getSortedRowModel(),
    getFilteredRowModel: manual ? undefined : getFilteredRowModel(),
    manualFiltering: manual,
    manualPagination: manual,
    manualSorting: manual,
    onSortingChange: onSortingChange ?? setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting: controlledSorting ?? sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const hasToolbar = Boolean(filterKey || toolbar);

  return (
    <div aria-busy={isPending} className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {filterKey ? (
            <div className="relative w-full max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={filterPlaceholder}
                className="pl-9"
                onChange={(event) =>
                  table.getColumn(filterKey)?.setFilterValue(event.target.value)
                }
                placeholder={filterPlaceholder}
                value={(table.getColumn(filterKey)?.getFilterValue() as string) ?? ""}
              />
            </div>
          ) : null}
          {toolbar}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn("shrink-0", !hasToolbar && "sm:ml-auto")}
              variant="outline"
            >
              <Settings2 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter(
                (column) =>
                  typeof column.accessorFn !== "undefined" && column.getCanHide(),
              )
              .map((column) => (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  className="capitalize"
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                >
                  {column.id.replaceAll("_", " ")}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={
                      header.column.columnDef.size
                        ? {
                            width: header.getSize(),
                            maxWidth: header.column.columnDef.size,
                          }
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pagination === false
        ? null
        : pagination ?? <DataTablePagination table={table} />}
    </div>
  );
}
