import "server-only";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResourceForm } from "@/features/shared/components/resource-form";
import { loadResourceBlockedRanges } from "@/features/shared/services/load-resource-blocked-ranges";
import { loadResourceReferences } from "@/features/shared/services/load-resource-references";
import type {
  ActionResult,
  AppRole,
  ResourceBlockedRanges,
  ResourceDefinition,
  ResourceReferences,
} from "@/features/shared/types/resource";

type SaveAction = (
  formData: FormData,
) => Promise<ActionResult<{ id: string; href: string }>>;

export async function ResourceCreateScreen({
  definition,
  action,
  initialValues,
  notice,
}: {
  definition: ResourceDefinition;
  action: SaveAction;
  /** Prefill from the link that opened the form, e.g. `?vehicle_id=…`. */
  initialValues?: Record<string, string>;
  /** A heads-up above the form, e.g. a service due on the chosen car. */
  notice?: ReactNode;
}) {
  let role: AppRole = "customer";
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

    [references, blockedRanges] = await Promise.all([
      loadResourceReferences(supabase, definition.fields),
      loadResourceBlockedRanges(supabase, definition.fields),
    ]);
  }

  const canWrite = definition.writeRoles.includes(role);
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: definition.plural, href: definition.route },
          { label: `New ${definition.singular.toLowerCase()}` },
        ]}
        description={`Create a ${definition.singular.toLowerCase()}.`}
        title={`New ${definition.singular.toLowerCase()}`}
      />
      <Button asChild variant="ghost">
        <Link href={definition.route}>
          <ArrowLeft /> Back to {definition.plural.toLowerCase()}
        </Link>
      </Button>
      {canWrite ? notice : null}
      {canWrite ? (
        <ResourceForm
          action={action}
          blockedRanges={blockedRanges}
          initialValues={initialValues}
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
