/**
 * Client-safe entry point for the shared feature.
 *
 * The main `@/features/shared` barrel re-exports screens that import
 * `server-only`, so a Client Component reaching for a hook through it poisons
 * the browser bundle. Cross-feature client imports come through here instead.
 */
export { useDebouncedNavigation } from "./hooks/use-debounced-navigation";
export type { DebouncedNavigation } from "./hooks/use-debounced-navigation";
