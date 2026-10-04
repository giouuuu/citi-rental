import type { ResourceField } from "@/features/shared/types/resource";

/**
 * Prefill for a create form from its URL, e.g. `/rentals/new?vehicle_id=…`
 * from the vehicle page. Only the form's own fields are taken, so a link
 * cannot set anything the form does not show.
 */
export function initialValuesFromSearchParams(
  fields: Pick<ResourceField, "name" | "type">[],
  query: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "image") continue;
    const raw = query[field.name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim() && value.length <= 500) values[field.name] = value;
  }
  return values;
}
