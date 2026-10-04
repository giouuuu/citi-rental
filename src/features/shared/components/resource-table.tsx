"use client";

import { useMemo } from "react";
import type { SortingState } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
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
  ResourceQuery,
  ResourceRow,
} from "@/features/shared/types/resource";

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
};

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
      }),
    [props.columns, props.route, props.singular, props.titleField],
  );
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

  return (
    <DataTable
      columns={columns}
      controlledSorting={sorting}
      data={props.rows}
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
        </div>
      }
    />
  );
}
