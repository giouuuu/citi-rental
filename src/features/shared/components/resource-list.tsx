import type { ReactNode } from "react";
import Link from "next/link";
import { Filter, Plus, X } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportButton } from "@/features/shared/components/export-button";
import { ResourceTable } from "@/features/shared/components/resource-table";
import { defaultDateRangePresets } from "@/features/shared/lib/date-range-presets";
import { manilaDateKey } from "@/features/shared/lib/manila-time";
import {
  resolveDateRangeFilter,
  resourceTableUrl,
  resolveFallbackSort,
} from "@/features/shared/lib/resource-table-url";
import type {
  ResourceDefinition,
  ResourceFilter,
  ResourcePage,
  ResourceQuery,
  ResourceReferences,
} from "@/features/shared/types/resource";

/** The list's current search, sort and filters, minus paging: the export takes every match. */
function exportHref(route: string, query: ResourceQuery) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  params.set("sort", query.sort);
  params.set("direction", query.direction);
  for (const [param, value] of Object.entries(query.filters ?? {}))
    params.set(param, value);
  return `/export${route}?${params}`;
}

function filterValueLabel(filter: ResourceFilter, value: string | undefined) {
  return (value && filter.valueLabels?.[value]) ?? value;
}

export function ResourceList({
  definition,
  result,
  query,
  canWrite,
  bulkActions,
  filterOptions = {},
}: {
  definition: ResourceDefinition;
  result: ResourcePage;
  query: ResourceQuery;
  canWrite: boolean;
  /** Choices for `reference` pickers, keyed by filter param. */
  filterOptions?: ResourceReferences;
  /** Controls for checked rows; offered only to roles that can write. */
  bulkActions?: ReactNode;
}) {
  const dateRange = resolveDateRangeFilter(definition.filters);
  const pickers = (definition.filters ?? []).filter(
    (filter) =>
      filter.picker && filter.op === "eq" && (filter.valueLabels || filter.reference),
  );
  // The date pair and the pickers show their own value, so they get no chip.
  const activeFilters = (definition.filters ?? []).filter(
    (filter) =>
      query.filters?.[filter.param] &&
      !pickers.includes(filter) &&
      filter.param !== dateRange?.fromParam &&
      filter.param !== dateRange?.toParam,
  );
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <ExportButton
              disabled={result.page === 1 && result.rows.length === 0}
              href={exportHref(definition.route, query)}
            />
            {canWrite ? (
              <Button asChild>
                <Link href={`${definition.route}/new`}>
                  <Plus /> Add {definition.singular.toLowerCase()}
                </Link>
              </Button>
            ) : null}
          </>
        }
        breadcrumbs={[
          definition.parent ?? { label: "Workspace", href: "/dashboard" },
          { label: definition.plural },
        ]}
        description={definition.description}
        title={definition.plural}
      />
      <Card>
        <CardContent className="space-y-4 pt-5">
          {activeFilters.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
              {activeFilters.map((filter) => (
                <Badge key={filter.param} variant="secondary">
                  {filter.showValue
                    ? `${filter.label}: ${filterValueLabel(filter, query.filters?.[filter.param])}`
                    : filter.label}
                </Badge>
              ))}
              <Button asChild size="sm" variant="ghost">
                <Link
                  href={resourceTableUrl(
                    definition.route,
                    { ...query, filters: {} },
                    { page: 1 },
                    resolveFallbackSort(definition.columns),
                  )}
                  scroll={false}
                >
                  <X /> Clear filters
                </Link>
              </Button>
            </div>
          ) : null}
          <ResourceTable
            bulkActions={canWrite ? bulkActions : undefined}
            canWrite={canWrite}
            columns={definition.columns}
            dateRange={
              dateRange
                ? { ...dateRange, presets: defaultDateRangePresets(manilaDateKey(new Date())) }
                : undefined
            }
            hasNextPage={result.hasNextPage}
            page={result.page}
            pageSize={result.pageSize}
            pickers={pickers.map((filter) => ({
              param: filter.param,
              label: filter.label,
              options: filter.reference
                ? (filterOptions[filter.param] ?? [])
                : Object.entries(filter.valueLabels ?? {}).map(([value, label]) => ({
                    value,
                    label,
                  })),
            }))}
            plural={definition.plural}
            query={query}
            route={definition.route}
            rowLinks={definition.rowLinks}
            rows={result.rows}
            singular={definition.singular}
            titleField={definition.titleField}
          />
        </CardContent>
      </Card>
    </div>
  );
}
