import { z } from "zod";
import { resolveFallbackSort } from "@/features/shared/lib/resource-table-url";
import type {
  ResourceDefinition,
  ResourceQuery,
} from "@/features/shared/types/resource";

const querySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  page_size: z.coerce.number().int().min(10).max(50).catch(20),
  sort: z.string().trim().max(80).catch(""),
  direction: z.enum(["asc", "desc"]).catch("desc"),
});

export function parseResourceQuery(
  raw: Record<string, string | string[] | undefined>,
  definition: Pick<ResourceDefinition, "columns" | "filters">,
): ResourceQuery {
  const values = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const parsed = querySchema.parse(values);
  const allowedSorts = new Set(definition.columns.map((column) => column.key));
  const fallbackSort = resolveFallbackSort(definition.columns);
  const filters: Record<string, string> = {};
  for (const filter of definition.filters ?? []) {
    const value = values[filter.param]?.trim();
    if (value && FILTER_VALUE.test(value)) filters[filter.param] = value;
  }
  return {
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.page_size,
    sort: allowedSorts.has(parsed.sort) ? parsed.sort : fallbackSort,
    direction: parsed.direction,
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

/** Ids, date keys and enum values; anything else is dropped, not queried. */
const FILTER_VALUE = /^[A-Za-z0-9_.:-]{1,80}$/;
