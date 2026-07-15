import { z } from "zod";
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
  definition: ResourceDefinition,
): ResourceQuery {
  const values = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const parsed = querySchema.parse(values);
  const allowedSorts = new Set(definition.columns.map((column) => column.key));
  const fallbackSort = definition.columns.some(
    (column) => column.key === "updated_at",
  )
    ? "updated_at"
    : (definition.columns[0]?.key ?? "id");
  return {
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.page_size,
    sort: allowedSorts.has(parsed.sort) ? parsed.sort : fallbackSort,
    direction: parsed.direction,
  };
}
