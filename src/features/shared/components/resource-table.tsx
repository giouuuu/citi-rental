"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { buildResourceColumns } from "@/features/shared/components/resource-table-columns";
import {
  ResourceTablePagination,
  resourceTableUrl,
} from "@/features/shared/components/resource-table-pagination";
import type {
  ResourceColumn,
  ResourceQuery,
  ResourceRow,
} from "@/features/shared/types/resource";

type Props = {
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
};

export function ResourceTable(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildResourceColumns(props), [props]);
  const sorting: SortingState = [
    { id: props.query.sort, desc: props.query.direction === "desc" },
  ];

  return (
    <DataTable
      columns={columns}
      controlledSorting={sorting}
      data={props.rows}
      emptyMessage={`No ${props.plural.toLowerCase()} found. Adjust the search or create the first record.`}
      isPending={isPending}
      manual
      onSortingChange={(updater) => {
        const next = typeof updater === "function" ? updater(sorting) : updater;
        const sort = next[0];
        if (!sort) return;
        startTransition(() =>
          router.push(
            resourceTableUrl(props.route, props.query, {
              page: 1,
              sort: sort.id,
              direction: sort.desc ? "desc" : "asc",
            }),
          ),
        );
      }}
      pagination={
        <ResourceTablePagination
          hasNextPage={props.hasNextPage}
          isPending={isPending}
          page={props.page}
          pageSize={props.pageSize}
          query={props.query}
          route={props.route}
        />
      }
    />
  );
}
