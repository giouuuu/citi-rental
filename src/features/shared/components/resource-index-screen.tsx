import "server-only";

import type { ReactNode } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResourceList } from "@/features/shared/components/resource-list";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import { loadResourceReferences } from "@/features/shared/services/load-resource-references";
import { selectResourceRows } from "@/features/shared/services/select-resource-rows";
import type {
  AppRole,
  ResourceDefinition,
  ResourceField,
} from "@/features/shared/types/resource";

export async function ResourceIndexScreen({
  definition,
  searchParams,
  bulkActions,
}: {
  definition: ResourceDefinition;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  /** Controls for checked rows (adds a checkbox column for writers). */
  bulkActions?: ReactNode;
}) {
  const resourceQuery = parseResourceQuery(
    searchParams ? await searchParams : {},
    definition,
  );

  if (!isSupabaseConfigured()) {
    const matching = (definition.demoRows ?? []).filter((row) =>
      String(row[definition.searchColumn] ?? "")
        .toLowerCase()
        .includes(resourceQuery.q.toLowerCase()),
    );
    return (
      <ResourceList
        canWrite={definition.allowCreate !== false}
        definition={definition}
        query={resourceQuery}
        result={{
          rows: matching.slice(0, resourceQuery.pageSize),
          page: 1,
          pageSize: resourceQuery.pageSize,
          hasNextPage: false,
        }}
      />
    );
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Your session expired. Sign in and try again.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.is_active)
    throw new Error("Your profile is not active.");

  const from = (resourceQuery.page - 1) * resourceQuery.pageSize;
  // One extra row tells us whether there is a next page.
  // Pickers over another table (customer, vehicle) load their choices the way
  // the form's reference fields do, keyed by filter param.
  const referenceFilters: ResourceField[] = (definition.filters ?? []).flatMap((filter) =>
    filter.picker && filter.reference
      ? [{ name: filter.param, label: filter.label, reference: filter.reference }]
      : [],
  );
  const [rows, filterOptions] = await Promise.all([
    selectResourceRows(supabase, definition, resourceQuery, {
      from,
      to: from + resourceQuery.pageSize,
    }),
    loadResourceReferences(supabase, referenceFilters),
  ]);

  return (
    <ResourceList
      bulkActions={bulkActions}
      canWrite={
        definition.writeRoles.includes(profile.role as AppRole) &&
        definition.allowCreate !== false
      }
      definition={definition}
      filterOptions={filterOptions}
      query={resourceQuery}
      result={{
        rows: rows.slice(0, resourceQuery.pageSize),
        page: resourceQuery.page,
        pageSize: resourceQuery.pageSize,
        hasNextPage: rows.length > resourceQuery.pageSize,
      }}
    />
  );
}
