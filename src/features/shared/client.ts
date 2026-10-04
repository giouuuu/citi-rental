/**
 * Client-safe entry point for the shared feature.
 *
 * The main `@/features/shared` barrel re-exports screens that import
 * `server-only`, so a Client Component reaching for a hook through it poisons
 * the browser bundle. Cross-feature client imports come through here instead.
 */
export { useDebouncedNavigation } from "./hooks/use-debounced-navigation";
export type { DebouncedNavigation } from "./hooks/use-debounced-navigation";
export { formatPhp, formatPhpCompact, formatPhpExact } from "./lib/money";
export { formatDateKey, formatManila } from "./lib/manila-time";
export { DateRangePicker } from "./components/date-range-picker";
export type { DateRangeSelection } from "./components/date-range-picker";
export {
  defaultDateRangePresets,
  monthDateRangePresets,
  quarterDateRangePresets,
  quickDateRangePresets,
  yearDateRangePresets,
} from "./lib/date-range-presets";
export type { DateRangePreset, DateRangeValue } from "./lib/date-range-presets";
