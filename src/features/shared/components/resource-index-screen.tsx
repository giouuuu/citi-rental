import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResourceList } from "@/features/shared/components/resource-list";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import type {
  AppRole,
  ResourceDefinition,
  ResourceRow,
} from "@/features/shared/types/resource";

export async function ResourceIndexScreen({
  definition,
  searchParams,
}: {
  definition: ResourceDefinition;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
    .select("organization_id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.is_active)
    throw new Error("Your profile is not active for this organization.");

  const columns = [
    ...new Set(
      [
        "id",
        definition.titleField,
        definition.subtitleField,
        ...definition.columns.map((column) => column.key),
      ].filter(Boolean),
    ),
  ].join(",");
  const from = (resourceQuery.page - 1) * resourceQuery.pageSize;
  const to = from + resourceQuery.pageSize;
  let request = supabase
    .from(definition.table)
    .select(columns)
    .eq("organization_id", profile.organization_id);
  if (resourceQuery.q)
    request = request.ilike(
      definition.searchColumn,
      `%${resourceQuery.q}%`,
    );
  const { data, error } = await request
    .order(resourceQuery.sort, { ascending: resourceQuery.direction === "asc" })
    .order("id", { ascending: resourceQuery.direction === "asc" })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ResourceRow[];

  return (
    <ResourceList
      canWrite={
        definition.writeRoles.includes(profile.role as AppRole) &&
        definition.allowCreate !== false
      }
      definition={definition}
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
