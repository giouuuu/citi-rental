"use client";

import { createContext, useContext } from "react";

type ResourceSelection = {
  /** Ids of the checked rows on the current page. */
  ids: string[];
  clear: () => void;
};

export const ResourceSelectionContext = createContext<ResourceSelection | null>(null);

/**
 * The checked rows of the surrounding resource table. Bulk-action controls are
 * rendered by the server page, so they read the selection from here instead of
 * taking it as a prop.
 */
export function useResourceSelection() {
  const context = useContext(ResourceSelectionContext);
  if (!context)
    throw new Error("useResourceSelection must be used inside a selectable ResourceTable.");
  return context;
}
