"use client";

import Link from "next/link";
import { Plus, SearchX, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { resourceEmptyCopy } from "@/features/shared/lib/resource-empty-copy";

/**
 * Rendered inside the table body so the column headers and chrome survive —
 * swapping the whole table for a card mid-search loses the user's bearings.
 */
export function ResourceEmptyState({
  canWrite,
  onClearSearch,
  plural,
  query,
  route,
  singular,
}: {
  canWrite: boolean;
  onClearSearch: () => void;
  plural: string;
  query: string;
  route: string;
  singular: string;
}) {
  const copy = resourceEmptyCopy({ plural, query, singular });
  const Icon = copy.isFiltered ? SearchX : Inbox;

  return (
    <Empty className="border-0 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {copy.isFiltered ? (
          <Button onClick={onClearSearch} type="button" variant="outline">
            Clear search
          </Button>
        ) : canWrite ? (
          <Button asChild>
            <Link href={`${route}/new`}>
              <Plus /> Add {singular.toLowerCase()}
            </Link>
          </Button>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
