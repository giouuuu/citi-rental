import "server-only";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResourceForm } from "@/features/shared/components/resource-form";
import type {
  ActionResult,
  AppRole,
  ResourceDefinition,
  ResourceReferences,
} from "@/features/shared/types/resource";

type SaveAction = (
  formData: FormData,
) => Promise<ActionResult<{ id: string; href: string }>>;

export async function ResourceCreateScreen({
  definition,
  action,
}: {
  definition: ResourceDefinition;
  action: SaveAction;
}) {
  let role: AppRole = "administrator";
  const references: ResourceReferences = {};

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId)
      throw new Error("Your session expired. Sign in and try again.");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile?.is_active)
      throw new Error("Your profile is not active for this organization.");
    role = profile.role as AppRole;

    await Promise.all(
      definition.fields.map(async (field) => {
        if (!field.reference) return;
        const { table, labelColumn, secondaryColumn, activeColumn } =
          field.reference;
        const columns = ["id", labelColumn, secondaryColumn]
          .filter(Boolean)
          .join(",");
        let request = supabase
          .from(table)
          .select(columns)
          .eq("organization_id", profile.organization_id);
        if (activeColumn) request = request.eq(activeColumn, true);
        const { data, error } = await request.limit(200);
        if (error) throw new Error(error.message);
        references[field.name] = (
          (data ?? []) as unknown as Record<string, unknown>[]
        ).map((row) => ({
          value: String(row.id),
          label:
            secondaryColumn && row[secondaryColumn]
              ? `${String(row[labelColumn])} · ${String(row[secondaryColumn])}`
              : String(row[labelColumn] ?? row.id),
        }));
      }),
    );
  }

  const canWrite = definition.writeRoles.includes(role);
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: definition.plural, href: definition.route },
          { label: `New ${definition.singular.toLowerCase()}` },
        ]}
        description={`Create a ${definition.singular.toLowerCase()} for this organization.`}
        title={`New ${definition.singular.toLowerCase()}`}
      />
      <Button asChild variant="ghost">
        <Link href={definition.route}>
          <ArrowLeft /> Back to {definition.plural.toLowerCase()}
        </Link>
      </Button>
      {canWrite ? (
        <ResourceForm
          action={action}
          definition={{
            key: definition.key,
            singular: definition.singular,
            fields: definition.fields,
          }}
          references={references}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Your role cannot create {definition.plural.toLowerCase()}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
