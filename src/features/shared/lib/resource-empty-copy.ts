export type ResourceEmptyCopy = {
  /** True when rows exist but none match the active search. */
  isFiltered: boolean;
  title: string;
  description: string;
};

/**
 * A list with no rows means two very different things. "Nothing here yet" wants
 * a create button; "nothing matched" wants the search term named back and a way
 * out of it. Conflating them strands users mid-search.
 */
export function resourceEmptyCopy({
  plural,
  query,
  singular,
}: {
  plural: string;
  query: string;
  singular: string;
}): ResourceEmptyCopy {
  const items = plural.toLowerCase();
  const trimmed = query.trim();

  if (trimmed) {
    return {
      isFiltered: true,
      title: `No ${items} match your search.`,
      description: `Nothing matches “${trimmed}”. Try a shorter term or clear the search.`,
    };
  }

  return {
    isFiltered: false,
    title: `No ${items} yet`,
    description: `Add your first ${singular.toLowerCase()} to get started.`,
  };
}
