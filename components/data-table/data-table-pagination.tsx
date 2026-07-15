"use client";

import type { Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DataTablePagination<TData>({ table }: { table: Table<TData> }) {
  const filteredRows = table.getFilteredRowModel().rows.length;
  const selectedRows = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex flex-col gap-3 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">
        {selectedRows > 0
          ? `${selectedRows} of ${filteredRows} row${filteredRows === 1 ? "" : "s"} selected`
          : `${filteredRows} row${filteredRows === 1 ? "" : "s"}`}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-xs font-medium text-foreground">Rows</span>
          <Select
            onValueChange={(value) => table.setPageSize(Number(value))}
            value={`${table.getState().pagination.pageSize}`}
          >
            <SelectTrigger aria-label="Rows per page" className="h-9 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[5, 10, 20, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="min-w-24 text-center text-xs font-medium text-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </span>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Go to first page"
            className="hidden md:inline-flex"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronsLeft />
          </Button>
          <Button
            aria-label="Go to previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Go to next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
          <Button
            aria-label="Go to last page"
            className="hidden md:inline-flex"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
