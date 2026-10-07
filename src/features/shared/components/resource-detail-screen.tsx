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
import type { ResourceFormProps } from "@/features/shared/types/resource-form";
import { loadResourceBlockedRanges } from "@/features/shared/services/load-resource-blocked-ranges";
import { loadResourceReferences } from "@/features/shared/services/load-resource-references";
import type {
  ActionResult,
  AppRole,
  ResourceBlockedRanges,
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
  quickCreate,
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
  /** Create a linked record (a customer) from its picker. */
  quickCreate?: ResourceFormProps["quickCreate"];
  children?: (parts: {
    form: ReactNode;
    row: ResourceRow;
    role: AppRole;
    canWrite: boolean;
    formReadOnly: boolean;
  }) => ReactNode;
}) {
  let role: AppRole = "customer";
  let row: ResourceRow | null =
    definition.demoRows?.find((item) => item.id === id) ?? null;
  let references: ResourceReferences = {};
  let blockedRanges: ResourceBlockedRanges = {};

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId)
      throw new Error("Your session expired. Sign in and try again.");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile?.is_active)
      throw new Error("Your profile is not active.");
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
      .eq("id", id)
      .maybeSingle();
    // Keep current linked records visible on edit, even if normally excluded.
    const referenceRequest = loadResourceReferences(supabase, definition.fields, { narrow: false });
    // Other bookings block the calendar; this record's own dates don't.
    const blockedRequest = loadResourceBlockedRanges(supabase, definition.fields, { excludeId: id });
    const [{ data, error }, loaded, blocked] = await Promise.all([
      rowRequest,
      referenceRequest,
      blockedRequest,
    ]);
    references = loaded;
    blockedRanges = blocked;
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
                  successMessage={`${definition.singular} updated — ${definition.archive.label.toLowerCase()} applied.`}
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
            blockedRanges={blockedRanges}
            definition={{
              key: definition.key,
              singular: definition.singular,
              fields: definition.fields,
            }}
            quickCreate={quickCreate}
            readOnly={isFormReadOnly}
            references={references}
            row={row}
          />
        );
        if (children)
          return children({
            form,
            row,
            role,
            canWrite,
            formReadOnly: isFormReadOnly,
          });
        return form;
      })()}
    </div>
  );
}
