import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResourceTable } from "@/features/shared/components/resource-table";
import type {
  ResourceDefinition,
  ResourcePage,
  ResourceQuery,
} from "@/features/shared/types/resource";

export function ResourceList({
  definition,
  result,
  query,
  canWrite,
}: {
  definition: ResourceDefinition;
  result: ResourcePage;
  query: ResourceQuery;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canWrite ? (
            <Button asChild>
              <Link href={`${definition.route}/new`}>
                <Plus /> Add {definition.singular.toLowerCase()}
              </Link>
            </Button>
          ) : undefined
        }
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: definition.plural },
        ]}
        description={definition.description}
        title={definition.plural}
      />
      <Card>
        <CardContent className="pt-5">
          <ResourceTable
            canWrite={canWrite}
            columns={definition.columns}
            hasNextPage={result.hasNextPage}
            page={result.page}
            pageSize={result.pageSize}
            plural={definition.plural}
            query={query}
            route={definition.route}
            rows={result.rows}
            singular={definition.singular}
            titleField={definition.titleField}
          />
        </CardContent>
      </Card>
    </div>
  );
}
