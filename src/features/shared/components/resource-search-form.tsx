"use client";

import { Search } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResourceSearchFormValues = {
  q: string;
};

export function ResourceSearchForm({
  plural,
  defaultQuery,
  pageSize,
  sort,
  direction,
}: {
  plural: string;
  defaultQuery: string;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
}) {
  const { register } = useForm<ResourceSearchFormValues>({
    defaultValues: { q: defaultQuery },
  });

  return (
    <form className="flex w-full max-w-md gap-2" method="get" role="search">
      <input name="page_size" type="hidden" value={pageSize} />
      <input name="sort" type="hidden" value={sort} />
      <input name="direction" type="hidden" value={direction} />
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={`Search ${plural.toLowerCase()}`}
          className="pl-9"
          placeholder={`Search ${plural.toLowerCase()}…`}
          {...register("q")}
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
