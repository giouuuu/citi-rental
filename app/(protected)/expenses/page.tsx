import Link from "next/link";
import { Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { vehicleExpenseDefinition } from "@/features/vehicle-costs";
import { ResourceIndexScreen } from "@/features/shared";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={vehicleExpenseDefinition}
      headerActions={
        <Button asChild variant="outline">
          <Link href="/expenses/categories">
            <Tags /> Categories
          </Link>
        </Button>
      }
      searchParams={searchParams}
    />
  );
}
