"use client";

import { useRouter } from "next/navigation";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/** Query params that belong to one record's visit, not to the view. */
const RECORD_ONLY_PARAMS = ["saved"];

/**
 * A detail page title that opens a picker of sibling records, so staff can
 * hop from one record to the next without going back to the list. Keeps the
 * open tab and period so the same view lands on the new record.
 */
export function ResourceSwitcher({
  currentId,
  options,
  route,
  label,
  searchPlaceholder,
}: {
  currentId: string;
  options: ComboboxOption[];
  /** List route; records live at `${route}/${id}`. */
  route: string;
  /** Names the picker for screen readers, e.g. "Switch vehicle". */
  label: string;
  searchPlaceholder?: string;
}) {
  const router = useRouter();

  function open(id: string) {
    if (id === currentId) return;
    const params = new URLSearchParams(window.location.search);
    for (const key of RECORD_ONLY_PARAMS) params.delete(key);
    const query = params.toString();
    router.push(`${route}/${id}${query ? `?${query}` : ""}`);
  }

  return (
    <Combobox
      aria-label={label}
      className="h-auto w-fit rounded-md border-transparent bg-transparent px-1.5 py-0 -mx-1.5 text-[1.75rem] leading-9 font-bold tracking-[-0.025em] text-foreground shadow-none hover:bg-muted md:text-[1.75rem] [&>svg]:size-5"
      contentClassName="w-80"
      onValueChange={open}
      options={options}
      searchPlaceholder={searchPlaceholder}
      value={currentId}
    />
  );
}
