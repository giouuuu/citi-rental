"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Wrench } from "lucide-react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";

import { StatusBadge } from "@/components/design-system/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NextDueCell } from "@/features/maintenance/components/next-due-cell";
import { RecordMaintenanceDialog } from "@/features/maintenance/components/record-maintenance-dialog";
import {
  describeInterval,
  formatKm,
  MAINTENANCE_STATE_LABELS,
  type MaintenanceState,
  type ScheduledPlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import {
  MAINTENANCE_FALLBACK_SORT,
  MAINTENANCE_ROUTE,
} from "@/features/maintenance/lib/maintenance-options";
import { ExportButton } from "@/features/shared/components/export-button";
import { ResourceEmptyState } from "@/features/shared/components/resource-empty-state";
import { ResourceSearchForm } from "@/features/shared/components/resource-search-form";
import { ResourceTablePagination } from "@/features/shared/components/resource-table-pagination";
import { useDebouncedNavigation } from "@/features/shared/hooks/use-debounced-navigation";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { resourceTableUrl } from "@/features/shared/lib/resource-table-url";
import type { ResourceQuery } from "@/features/shared/types/resource";

const ALL = "all";
const STATUS_OPTIONS: MaintenanceState[] = ["overdue", "due_soon", "on_schedule"];

const columnHelper = createColumnHelper<ScheduledPlan>();

/**
 * The fleet's service schedule: every active plan on every working car,
 * server-paginated, with Record on each row.
 */
export function MaintenanceScheduleTable({
  rows,
  query,
  hasNextPage,
  today,
}: {
  rows: ScheduledPlan[];
  query: ResourceQuery;
  hasNextPage: boolean;
  today: string;
}) {
  const { isPending, navigate, navigateNow } = useDebouncedNavigation();
  const [recording, setRecording] = useState<ScheduledPlan | null>(null);

  const urlFor = (changes: Partial<ResourceQuery>) =>
    resourceTableUrl(MAINTENANCE_ROUTE, query, changes, MAINTENANCE_FALLBACK_SORT);
  const sorting: SortingState = [{ id: query.sort, desc: query.direction === "desc" }];
  const status = query.filters?.status ?? ALL;
  const filtered = Boolean(query.q) || Object.keys(query.filters ?? {}).length > 0;

  const columns = useMemo(
    () => [
      // Sorts server-side by `urgency`, so overdue comes first.
      columnHelper.accessor((row): unknown => row.status, {
        id: "urgency",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <StatusBadge label={MAINTENANCE_STATE_LABELS[row.original.status]} status={row.original.status} />
        ),
      }),
      columnHelper.accessor((row): unknown => row.plateNumber, {
        id: "plate_number",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Car" />,
        cell: ({ row }) => (
          <Link className="underline-offset-4 hover:underline" href={`/vehicles/${row.original.vehicleId}?tab=maintenance`}>
            <span className="font-medium">{row.original.plateNumber}</span>
            <span className="block text-xs text-muted-foreground">{row.original.vehicleName}</span>
          </Link>
        ),
      }),
      columnHelper.accessor((row): unknown => row.name, {
        id: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Service" />,
        cell: ({ row }) => (
          <>
            {row.original.name}
            <span className="block text-xs text-muted-foreground">{describeInterval(row.original)}</span>
          </>
        ),
      }),
      columnHelper.accessor((row): unknown => row.lastDoneOn, {
        id: "last_done_on",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last done" />,
        cell: ({ row }) => (
          <>
            {formatDateKey(row.original.lastDoneOn)}
            {row.original.lastOdometer !== null ? (
              <span className="block text-xs text-muted-foreground">{formatKm(row.original.lastOdometer)}</span>
            ) : null}
          </>
        ),
      }),
      columnHelper.accessor((row): unknown => row.nextDueOn, {
        id: "next_due_on",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Next due" />,
        cell: ({ row }) => <NextDueCell plan={row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              onClick={() => setRecording(row.original)}
              size="sm"
              variant={row.original.status === "on_schedule" ? "ghost" : "outline"}
            >
              <Wrench /> Record
            </Button>
            <Button asChild size="icon-sm" variant="ghost">
              <Link
                aria-label={`Open ${row.original.plateNumber} maintenance`}
                href={`/vehicles/${row.original.vehicleId}?tab=maintenance`}
              >
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ),
      }),
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        controlledSorting={sorting}
        data={rows}
        emptyMessage={
          filtered ? (
            <ResourceEmptyState
              canWrite={false}
              filtered
              onClearSearch={() => navigateNow(urlFor({ q: "", filters: {} }))}
              plural="Services"
              query={query.q}
              route={MAINTENANCE_ROUTE}
              singular="Service"
            />
          ) : (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock />
                </EmptyMedia>
                <EmptyTitle>No service plans yet</EmptyTitle>
                <EmptyDescription>
                  Open a car and add its plans on the Maintenance tab, like an oil change every 10,000 km or PMS every
                  year.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link href="/vehicles">Go to vehicles</Link>
                </Button>
              </EmptyContent>
            </Empty>
          )
        }
        isPending={isPending}
        manual
        onSortingChange={(updater) => {
          const next = typeof updater === "function" ? updater(sorting) : updater;
          const sort = next[0];
          if (!sort) return;
          navigateNow(urlFor({ sort: sort.id, direction: sort.desc ? "desc" : "asc" }));
        }}
        pagination={
          <ResourceTablePagination
            hasNextPage={hasNextPage}
            isPending={isPending}
            onNavigate={navigateNow}
            page={query.page}
            plural="Services"
            query={query}
            rowCount={rows.length}
            urlFor={urlFor}
          />
        }
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <ResourceSearchForm
              defaultQuery={query.q}
              onCommit={(value) => navigateNow(urlFor({ q: value }))}
              onSearch={(value) => navigate(urlFor({ q: value }))}
              plural="Services"
            />
            <Combobox
              aria-label="Status"
              className="w-44"
              onValueChange={(value) => {
                const filters = { ...query.filters };
                if (value === ALL) delete filters.status;
                else filters.status = value;
                navigateNow(urlFor({ filters }));
              }}
              options={[
                { value: ALL, label: "All statuses" },
                ...STATUS_OPTIONS.map((option) => ({
                  value: option,
                  label: MAINTENANCE_STATE_LABELS[option],
                })),
              ]}
              value={status}
            />
            <div className="ml-auto">
              <ExportButton
                disabled={rows.length === 0}
                href={resourceTableUrl("/maintenance/export", query, { page: 1 }, MAINTENANCE_FALLBACK_SORT)}
                size="sm"
              />
            </div>
          </div>
        }
      />
      <RecordMaintenanceDialog
        currentOdometer={recording?.currentOdometer ?? null}
        initialPlanId={recording?.id ?? null}
        onOpenChange={(open) => {
          if (!open) setRecording(null);
        }}
        open={recording !== null}
        plans={recording ? [recording] : []}
        today={today}
        vehicleId={recording?.vehicleId ?? ""}
        vehicleLabel={recording ? [recording.plateNumber, recording.vehicleName].filter(Boolean).join(" · ") : ""}
      />
    </>
  );
}
