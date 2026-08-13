import type {
  ResourceColumn,
  ResourceQuery,
} from "@/features/shared/types/resource";

/** Mirrors the `.catch()` fallbacks in `resource-query-schema.ts`. */
export const RESOURCE_QUERY_DEFAULTS = {
  q: "",
  page: 1,
  pageSize: 20,
  direction: "desc",
} as const;

/**
 * The sort applied when the URL omits `sort`. Shared with `parseResourceQuery`
 * so the builder can drop the param whenever it matches the fallback.
 */
export function resolveFallbackSort(columns: readonly ResourceColumn[]): string {
  if (columns.some((column) => column.key === "updated_at")) return "updated_at";
  return columns[0]?.key ?? "id";
}

/**
 * Builds a resource list URL, omitting every param that is already the default
 * so links stay short and the client cache keys stay stable.
 *
 * Changing the query, sort, or direction resets to page 1 — a page 4 of the
 * previous result set is meaningless against a new one. Pass `page` explicitly
 * in `changes` to page without resetting.
 */
export function resourceTableUrl(
  route: string,
  query: ResourceQuery,
  changes: Partial<ResourceQuery> = {},
  fallbackSort?: string,
): string {
  const resetsPage =
    changes.page === undefined &&
    ((changes.q !== undefined && changes.q !== query.q) ||
      (changes.sort !== undefined && changes.sort !== query.sort) ||
      (changes.direction !== undefined && changes.direction !== query.direction));

  const next: ResourceQuery = { ...query, ...changes };
  if (resetsPage) next.page = RESOURCE_QUERY_DEFAULTS.page;

  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.page !== RESOURCE_QUERY_DEFAULTS.page) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== RESOURCE_QUERY_DEFAULTS.pageSize) {
    params.set("page_size", String(next.pageSize));
  }
  if (next.sort && next.sort !== fallbackSort) params.set("sort", next.sort);
  if (next.direction !== RESOURCE_QUERY_DEFAULTS.direction) {
    params.set("direction", next.direction);
  }

  const search = params.toString();
  return search ? `${route}?${search}` : route;
}
