import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { ResourceField, ResourceReferences } from "@/features/shared/types/resource";

/**
 * Options for every `reference` field (BIR line, vehicle, customer…), labelled
 * the way the form shows them. Create forms apply the field's `equals` and
 * `excludeStatuses` narrowing; pass `narrow: false` on edit so a record's
 * current link stays selectable.
 */
export async function loadResourceReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: ResourceField[],
  { narrow = true }: { narrow?: boolean } = {},
): Promise<ResourceReferences> {
  const references: ResourceReferences = {};

  await Promise.all(
    fields.map(async (field) => {
      if (!field.reference) return;
      const { table, labelColumn, secondaryColumn, activeColumn, statusColumn, excludeStatuses, equals } =
        field.reference;
      const columns = ["id", labelColumn, secondaryColumn, statusColumn].filter(Boolean).join(",");
      let request = supabase.from(table).select(columns);
      if (activeColumn) request = request.eq(activeColumn, true);
      if (narrow && equals) {
        for (const [column, value] of Object.entries(equals)) {
          request = request.eq(column, value);
        }
      }
      if (narrow && excludeStatuses?.length) {
        request = request.not(
          statusColumn ?? "status",
          "in",
          `(${excludeStatuses.map((status) => `"${status}"`).join(",")})`,
        );
      }
      const { data, error } = await request.limit(200);
      if (error) throw new Error(error.message);
      references[field.name] = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
        const base =
          secondaryColumn && row[secondaryColumn]
            ? `${String(row[labelColumn])} · ${String(row[secondaryColumn])}`
            : String(row[labelColumn] ?? row.id);
        const status = statusColumn && row[statusColumn] ? ` · ${String(row[statusColumn])}` : "";
        return { value: String(row.id), label: `${base}${status}` };
      });
    }),
  );

  return references;
}
