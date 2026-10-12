import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { ResourceField, ResourceOption, ResourceReferences } from "@/features/shared/types/resource";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Reference = NonNullable<ResourceField["reference"]>;

/** Past this many rows a picker shows the first ones by `orderBy` (or table order). */
const REFERENCE_LIMIT = 200;

function referenceColumns({ labelColumn, secondaryColumn, statusColumn, fills }: Reference) {
  return [...new Set(["id", labelColumn, secondaryColumn, statusColumn, ...Object.values(fills ?? {})])]
    .filter(Boolean)
    .join(",");
}

function referenceOption(
  { labelColumn, secondaryColumn, statusColumn, fills }: Reference,
  row: Record<string, unknown>,
): ResourceOption {
  const base =
    secondaryColumn && row[secondaryColumn]
      ? `${String(row[labelColumn])} · ${String(row[secondaryColumn])}`
      : String(row[labelColumn] ?? row.id);
  const status = statusColumn && row[statusColumn] ? ` · ${String(row[statusColumn])}` : "";
  const option: ResourceOption = { value: String(row.id), label: `${base}${status}` };
  if (fills) {
    option.fill = Object.fromEntries(
      Object.entries(fills).map(([field, column]) => [field, row[column] == null ? "" : String(row[column])]),
    );
  }
  return option;
}

/**
 * Options for every `reference` field (BIR line, vehicle, customer…), labelled
 * the way the form shows them. Create forms apply the field's `equals` and
 * `excludeStatuses` narrowing; pass `narrow: false` on edit so a record's
 * current link stays selectable. `selected` (field name → id) adds a chosen
 * record that the first rows left out, so its picker never reads blank.
 */
export async function loadResourceReferences(
  supabase: Supabase,
  fields: ResourceField[],
  {
    narrow = true,
    selected,
  }: { narrow?: boolean; selected?: Record<string, unknown> | null } = {},
): Promise<ResourceReferences> {
  const references: ResourceReferences = {};

  await Promise.all(
    fields.map(async (field) => {
      if (!field.reference) return;
      const { table, activeColumn, statusColumn, excludeStatuses, equals, orderBy } = field.reference;
      let request = supabase.from(table).select(referenceColumns(field.reference));
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
      if (orderBy) request = request.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const { data, error } = await request.limit(REFERENCE_LIMIT);
      if (error) throw new Error(error.message);
      references[field.name] = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
        referenceOption(field.reference!, row),
      );
    }),
  );

  if (selected) await addSelectedReferences(supabase, fields, references, selected);
  return references;
}

/**
 * Adds each `selected` record (field name → id) its picker's first rows left
 * out, e.g. an expense's rental from last year. One query per such field, and
 * none when every chosen record is already listed.
 */
export async function addSelectedReferences(
  supabase: Supabase,
  fields: ResourceField[],
  references: ResourceReferences,
  selected: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!selected) return;
  await Promise.all(
    fields.map(async (field) => {
      const id = selected[field.name];
      if (!field.reference || typeof id !== "string" || !id) return;
      const options = references[field.name] ?? [];
      if (options.some((option) => option.value === id)) return;
      const { data } = await supabase
        .from(field.reference.table)
        .select(referenceColumns(field.reference))
        .eq("id", id)
        .maybeSingle();
      if (!data) return;
      references[field.name] = [
        referenceOption(field.reference, data as unknown as Record<string, unknown>),
        ...options,
      ];
    }),
  );
}
