export type {
  ActionResult,
  ResourceActionState,
  ResourceDefinition,
  ResourceRow,
} from "./types/resource";
export { ConfirmActionDialog } from "./components/confirm-action-dialog";
export { ResourceCreateScreen } from "./components/resource-create-screen";
export { ResourceDetailScreen } from "./components/resource-detail-screen";
export { ResourceIndexScreen } from "./components/resource-index-screen";
export { ResourceListSkeleton } from "./components/resource-list-skeleton";
// Client-safe exports (hooks, client components) live in ./client — this barrel
// pulls in `server-only` modules and cannot be imported from a Client Component.
