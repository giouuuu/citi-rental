import "server-only";

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ArchiveButton } from "@/features/shared/components/archive-button";
import { ResourceForm } from "@/features/shared/components/resource-form";
import type {
  ActionResult,
  AppRole,
  ResourceDefinition,
  ResourceReferences,
  ResourceRow,
} from "@/features/shared/types/resource";

type SaveAction = (
  formData: FormData,
) => Promise<ActionResult<{ id: string; href: string }>>;
type ArchiveAction = (formData: FormData) => Promise<ActionResult>;

export async function ResourceDetailScreen({
  definition,
  id,
  action,
  archiveAction,
  saved,
  actions,
  formReadOnly,
  children,
}: {
  definition: ResourceDefinition;
  id: string;
  action: SaveAction;
  archiveAction?: ArchiveAction;
  saved?: boolean;
  actions?: ReactNode;
  /** Force the edit form read-only (in addition to role checks). */
  formReadOnly?: boolean | ((row: ResourceRow) => boolean);
  children?: (parts: {
    form: ReactNode;
    row: ResourceRow;
    canWrite: boolean;
    formReadOnly: boolean;
  }) => ReactNode;
}) {
  let role: AppRole = "customer";
  let row: ResourceRow | null =
    definition.demoRows?.find((item) => item.id === id) ?? null;
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

    const detailColumns = [
      ...new Set(
        [
          "id",
          definition.titleField,
          definition.subtitleField,
          ...(definition.detailColumns ??
            definition.fields.map((field) => field.name)),
        ].filter(Boolean),
      ),
    ].join(",");
    const rowRequest = supabase
      .from(definition.table)
      .select(detailColumns)
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    const referenceRequests = definition.fields.map(async (field) => {
      if (!field.reference) return;
      const {
        table,
        labelColumn,
        secondaryColumn,
        activeColumn,
        statusColumn,
      } = field.reference;
      const columns = ["id", labelColumn, secondaryColumn, statusColumn]
        .filter(Boolean)
        .join(",");
      let request = supabase
        .from(table)
        .select(columns)
        .eq("organization_id", profile.organization_id);
      if (activeColumn) request = request.eq(activeColumn, true);
      // Keep current linked records visible on edit, even if normally excluded.
      const { data, error } = await request.limit(200);
      if (error) throw new Error(error.message);
      references[field.name] = (
        (data ?? []) as unknown as Record<string, unknown>[]
      ).map((item) => {
        const base =
          secondaryColumn && item[secondaryColumn]
            ? `${String(item[labelColumn])} · ${String(item[secondaryColumn])}`
            : String(item[labelColumn] ?? item.id);
        const status =
          statusColumn && item[statusColumn]
            ? ` · ${String(item[statusColumn])}`
            : "";
        return { value: String(item.id), label: `${base}${status}` };
      });
    });
    const { data, error } = await rowRequest;
    await Promise.all(referenceRequests);
    if (error) throw new Error(error.message);
    row = data as ResourceRow | null;
  }

  if (!row) notFound();
  const title = String(row[definition.titleField] ?? definition.singular);
  const canWrite = definition.writeRoles.includes(role);
  const lockedByRule =
    typeof formReadOnly === "function"
      ? formReadOnly(row)
      : Boolean(formReadOnly);
  const isFormReadOnly = !canWrite || lockedByRule;
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canWrite ? (
            <>
              {actions}
              {definition.archive && archiveAction ? (
                <ArchiveButton
                  action={archiveAction}
                  href={definition.route}
                  id={id}
                  label={definition.archive.label}
                />
              ) : null}
            </>
          ) : undefined
        }
        breadcrumbs={[
          { label: definition.plural, href: definition.route },
          { label: title },
        ]}
        description={
          definition.subtitleField
            ? String(row[definition.subtitleField] ?? definition.description)
            : definition.description
        }
        title={title}
      />
      {saved ? (
        <Alert className="border-success/20 bg-success-surface">
          <CheckCircle2 className="text-success" />
          <AlertTitle>Changes saved</AlertTitle>
          <AlertDescription>
            The latest record is now available across the workspace.
          </AlertDescription>
        </Alert>
      ) : null}
      {(() => {
        const form = (
          <ResourceForm
            action={action}
            definition={{
              key: definition.key,
              singular: definition.singular,
              fields: definition.fields,
            }}
            readOnly={isFormReadOnly}
            references={references}
            row={row}
          />
        );
        if (children)
          return children({
            form,
            row,
            canWrite,
            formReadOnly: isFormReadOnly,
          });
        return form;
      })()}
    </div>
  );
}
