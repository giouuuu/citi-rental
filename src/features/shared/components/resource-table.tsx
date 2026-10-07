"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { X } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ResourceSelectionContext } from "@/features/shared/components/resource-selection";
import { useDebouncedNavigation } from "@/features/shared/hooks/use-debounced-navigation";
import {
  resolveFallbackSort,
  resourceTableUrl,
} from "@/features/shared/lib/resource-table-url";
import { buildResourceColumns } from "@/features/shared/components/resource-table-columns";
import { ResourceEmptyState } from "@/features/shared/components/resource-empty-state";
import { DateRangePicker } from "@/features/shared/components/date-range-picker";
import { ResourceSearchForm } from "@/features/shared/components/resource-search-form";
import { ResourceTablePagination } from "@/features/shared/components/resource-table-pagination";
import type { DateRangePreset } from "@/features/shared/lib/date-range-presets";
import { parseDateKey } from "@/features/shared/lib/manila-time";
import type {
  ResourceColumn,
  ResourceOption,
  ResourceQuery,
  ResourceRow,
} from "@/features/shared/types/resource";

/** Option value standing for "no filter"; never sent in the URL. */
const ALL = "__all";

type Props = {
  canWrite: boolean;
  columns: ResourceColumn[];
  rows: ResourceRow[];
  route: string;
  titleField: string;
  singular: string;
  plural: string;
  query: ResourceQuery;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  /** The list's date filter pair, shown as a range picker beside search. */
  dateRange?: { fromParam: string; toParam: string; presets: DateRangePreset[] };
  /** `eq` filters shown as dropdowns beside search. */
  pickers?: { param: string; label: string; options: ResourceOption[] }[];
  /**
   * Controls for the checked rows. Passing it adds a checkbox column; the
   * controls read the selection through `useResourceSelection`.
   */
  bulkActions?: ReactNode;
};

const getRowId = (row: ResourceRow) => row.id;

/**
 * Owns the one transition for the whole list. Search, sort, and paging are all
 * "the list is re-querying", so they share a single pending flag — which is
 * what lets the bar sit above the table instead of at the top of the viewport.
 */
export function ResourceTable(props: Props) {
  const { isPending, navigate, navigateNow } = useDebouncedNavigation();
  const columns = useMemo(
    () =>
      buildResourceColumns({
        columns: props.columns,
        route: props.route,
        singular: props.singular,
        titleField: props.titleField,
        selectable: Boolean(props.bulkActions),
      }),
    [props.columns, props.route, props.singular, props.titleField, props.bulkActions],
  );

  // A selection belongs to the rows it was made on: a new page, search or
  // filter starts from nothing checked rather than acting on unseen rows.
  const rowsKey = props.rows.map((row) => row.id).join(",");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectionRowsKey, setSelectionRowsKey] = useState(rowsKey);
  if (selectionRowsKey !== rowsKey) {
    setSelectionRowsKey(rowsKey);
    setSelection({});
  }
  const selectionContext = useMemo(
    () => ({
      ids: Object.keys(selection).filter((id) => selection[id]),
      clear: () => setSelection({}),
    }),
    [selection],
  );
  const selectedIds = selectionContext.ids;
  const fallbackSort = useMemo(
    () => resolveFallbackSort(props.columns),
    [props.columns],
  );
  const sorting: SortingState = [
    { id: props.query.sort, desc: props.query.direction === "desc" },
  ];

  const urlFor = (changes: Partial<ResourceQuery>) =>
    resourceTableUrl(props.route, props.query, changes, fallbackSort);

  const dateRange = props.dateRange;
  const setDates = (from: string | null, to: string | null) => {
    if (!dateRange) return;
    const filters = { ...props.query.filters };
    delete filters[dateRange.fromParam];
    delete filters[dateRange.toParam];
    if (from) filters[dateRange.fromParam] = from;
    if (to) filters[dateRange.toParam] = to;
    navigateNow(urlFor({ filters }));
  };

  const setFilter = (param: string, value: string) => {
    const filters = { ...props.query.filters };
    if (value === ALL) delete filters[param];
    else filters[param] = value;
    navigateNow(urlFor({ filters }));
  };

  return (
    <DataTable
      columns={columns}
      controlledSorting={sorting}
      data={props.rows}
      getRowId={getRowId}
      emptyMessage={
        <ResourceEmptyState
          canWrite={props.canWrite}
          filtered={Object.keys(props.query.filters ?? {}).length > 0}
          onClearSearch={() => navigateNow(urlFor({ q: "", filters: {} }))}
          plural={props.plural}
          query={props.query.q}
          route={props.route}
          singular={props.singular}
        />
      }
      isPending={isPending}
      manual
      onRowSelectionChange={setSelection}
      rowSelection={selection}
      onSortingChange={(updater) => {
        const next = typeof updater === "function" ? updater(sorting) : updater;
        const sort = next[0];
        if (!sort) return;
        navigateNow(
          urlFor({ sort: sort.id, direction: sort.desc ? "desc" : "asc" }),
        );
      }}
      pagination={
        <ResourceTablePagination
          hasNextPage={props.hasNextPage}
          isPending={isPending}
          onNavigate={navigateNow}
          page={props.page}
          plural={props.plural}
          query={props.query}
          rowCount={props.rows.length}
          urlFor={urlFor}
        />
      }
      toolbar={
        <div className="flex w-full flex-wrap items-center gap-2">
          <ResourceSearchForm
            defaultQuery={props.query.q}
            onCommit={(value) => navigateNow(urlFor({ q: value }))}
            onSearch={(value) => navigate(urlFor({ q: value }))}
            plural={props.plural}
          />
          {props.pickers?.map((picker) => (
            <Combobox
              aria-label={picker.label}
              className="w-40"
              contentClassName="min-w-64"
              key={picker.param}
              onValueChange={(value) => setFilter(picker.param, value)}
              options={[
                { value: ALL, label: `Any ${picker.label.toLowerCase()}` },
                ...picker.options,
              ]}
              value={props.query.filters?.[picker.param] ?? ALL}
            />
          ))}
          {dateRange ? (
            <DateRangePicker
              onClear={() => setDates(null, null)}
              onSelect={({ from, to }) => setDates(from, to)}
              presets={dateRange.presets}
              value={{
                from: parseDateKey(props.query.filters?.[dateRange.fromParam]) ?? undefined,
                to: parseDateKey(props.query.filters?.[dateRange.toParam]) ?? undefined,
              }}
            />
          ) : null}
          {props.bulkActions && selectedIds.length ? (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span aria-live="polite" className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <ResourceSelectionContext.Provider value={selectionContext}>
                {props.bulkActions}
              </ResourceSelectionContext.Provider>
              <Button
                aria-label="Clear selection"
                onClick={() => setSelection({})}
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
