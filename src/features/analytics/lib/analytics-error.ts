/**
 * Turns an analytics RPC failure into copy an owner can act on. A missing
 * function means the database is behind the app (the analytics migration has
 * not been applied) — say so instead of surfacing a PostgREST code.
 */
export function analyticsErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;

  if (code === "42501") return "Analytics are available to owners and admins only.";
  if (code === "PGRST202" || code === "42883") {
    return "Analytics need the latest database migration. Apply supabase/migrations and reload.";
  }
  return "This panel could not load. Reload the page to try again.";
}

/** PostgrestError has no enumerable props; log its message, not `{}`. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
