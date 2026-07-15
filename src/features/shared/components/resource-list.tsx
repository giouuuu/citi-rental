import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
        <CardContent className="space-y-4 pt-5">
          <form className="flex max-w-md gap-2" role="search">
            <input name="page_size" type="hidden" value={query.pageSize} />
            <input name="sort" type="hidden" value={query.sort} />
            <input name="direction" type="hidden" value={query.direction} />
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={`Search ${definition.plural.toLowerCase()}`}
                className="pl-9"
                defaultValue={query.q}
                name="q"
                placeholder={`Search ${definition.plural.toLowerCase()}…`}
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <ResourceTable
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
