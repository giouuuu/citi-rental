import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { manilaDayEnd, manilaDayStart, parseDateKey } from "@/features/shared/lib/manila-time";
import { flatResourceColumns } from "@/features/shared/lib/resource-table-url";
import type {
  ResourceColumn,
  ResourceDefinition,
  ResourceQuery,
  ResourceRow,
} from "@/features/shared/types/resource";

/**
 * Reads rows `from`..`to` (inclusive) of a resource list with its search,
 * filters and sort applied. The list screen and its export share this, so a
 * download always holds exactly the rows the screen would page through.
 */
export async function selectResourceRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  definition: ResourceDefinition,
  query: ResourceQuery,
  { from, to }: { from: number; to: number },
): Promise<ResourceRow[]> {
  const listColumns = flatResourceColumns(definition.columns);
  const references = listColumns.filter((column) => column.reference);
  const columns = [
    ...new Set(
      [
        "id",
        definition.titleField,
        definition.subtitleField,
        ...listColumns.map((column) =>
          column.reference ? embed(column) : column.key,
        ),
      ].filter(Boolean),
    ),
  ].join(",");
  let request = supabase.from(definition.table).select(columns);
  if (query.q)
    request = request.ilike(definition.searchColumn, `%${query.q}%`);
  for (const filter of definition.filters ?? []) {
    const value = query.filters?.[filter.param];
    if (!value) continue;
    const day = filter.timestamp ? parseDateKey(value) : null;
    if (filter.timestamp && !day) continue;
    request =
      filter.op === "gte"
        ? request.gte(filter.column, day ? manilaDayStart(day).toISOString() : value)
        : filter.op === "lte"
          ? day
            ? request.lt(filter.column, manilaDayEnd(day).toISOString())
            : request.lte(filter.column, value)
          : request.eq(filter.column, value);
  }
  // A linked column sorts by its record's label: `customer_name(full_name)`.
  const sortReference = references.find((column) => column.key === query.sort)?.reference;
  const { data, error } = await request
    .order(sortReference ? `${query.sort}(${sortReference.column})` : query.sort, {
      ascending: query.direction === "asc",
    })
    .order("id", { ascending: query.direction === "asc" })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ResourceRow[];
  if (!references.length) return rows;
  return rows.map((row) => {
    const flat: ResourceRow = { ...row };
    for (const column of references) flat[column.key] = referenceLabel(column, row[column.key]);
    return flat;
  });
}

/** `customer_name:customers(full_name)`: the linked record, named for the column. */
function embed(column: ResourceColumn) {
  const { table, column: label, secondaryColumn } = column.reference!;
  return `${column.key}:${table}(${[label, secondaryColumn].filter(Boolean).join(",")})`;
}

function referenceLabel(column: ResourceColumn, linked: unknown): string | null {
  if (!linked || typeof linked !== "object") return null;
  const record = linked as Record<string, unknown>;
  const { column: label, secondaryColumn } = column.reference!;
  return (
    [record[label], secondaryColumn ? record[secondaryColumn] : null]
      .filter((part) => part !== null && part !== undefined && part !== "")
      .map(String)
      .join(" · ") || null
  );
}
