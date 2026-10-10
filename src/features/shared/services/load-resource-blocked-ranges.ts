import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { toManilaDateTimeInput } from "@/features/shared/lib/manila-time";
import type {
  ResourceBlockedRanges,
  ResourceField,
} from "@/features/shared/types/resource";

/** One car's calendar won't hold more live bookings than this. */
const MAX_BLOCKING_ROWS = 1000;

function statusWord(value: unknown) {
  const text = String(value ?? "").replaceAll("_", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/**
 * Live bookings for every `date-range` field with `blockedBy`, grouped by the
 * value they hang off (the vehicle), so the form can repaint the calendar the
 * moment a different car is picked. Pass `excludeId` on edit so a rental
 * doesn't block its own dates.
 */
export async function loadResourceBlockedRanges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: ResourceField[],
  { excludeId }: { excludeId?: string } = {},
): Promise<ResourceBlockedRanges> {
  const blocked: ResourceBlockedRanges = {};

  await Promise.all(
    fields.map(async (field) => {
      const blockedBy = field.range?.blockedBy;
      if (field.type !== "date-range" || !field.range || !blockedBy) return;
      const statusColumn = blockedBy.statusColumn ?? "status";
      const alsoWhen = blockedBy.alsoWhen;
      const columns = [
        "id",
        blockedBy.field,
        field.name,
        field.range.endField,
        blockedBy.labelColumn,
        statusColumn,
        alsoWhen?.column,
      ].filter(Boolean);

      const selected = supabase
        .from(blockedBy.table)
        .select([...new Set(columns)].join(","));
      let request = alsoWhen
        ? selected.or(
            `${statusColumn}.in.(${blockedBy.statuses.join(",")}),` +
              `and(${statusColumn}.eq.${alsoWhen.status},${alsoWhen.column}.in.(${alsoWhen.values.join(",")}))`,
          )
        : selected.in(statusColumn, blockedBy.statuses);
      if (excludeId) request = request.neq("id", excludeId);
      const { data, error } = await request
        .order(field.name, { ascending: true })
        .limit(MAX_BLOCKING_ROWS);
      if (error) throw new Error(error.message);

      const byKey: Record<string, ResourceBlockedRanges[string][string]> = {};
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const key = row[blockedBy.field];
        const startAt = row[field.name];
        const endAt = row[field.range.endField];
        if (!key || !startAt || !endAt) continue;
        const status =
          alsoWhen?.label && row[statusColumn] === alsoWhen.status
            ? alsoWhen.label
            : statusWord(row[statusColumn]);
        const label = [
          blockedBy.labelColumn ? row[blockedBy.labelColumn] : null,
          status,
        ]
          .filter(Boolean)
          .join(" · ");
        // The calendar reads days as written, so hand it Manila wall-clock.
        (byKey[String(key)] ??= []).push({
          startAt: toManilaDateTimeInput(String(startAt)),
          endAt: toManilaDateTimeInput(String(endAt)),
          label: label || undefined,
        });
      }
      blocked[field.name] = byKey;
    }),
  );

  return blocked;
}
