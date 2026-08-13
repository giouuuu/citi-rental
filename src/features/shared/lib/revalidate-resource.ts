import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Drop the cached render of a resource's list, detail, and create pages after a
 * write.
 *
 * Server-side invalidation is what makes `experimental.staleTimes` safe: with a
 * non-zero client cache, a mutation that only calls `router.refresh()` leaves
 * other cached entries — and other tabs — showing the pre-mutation rows.
 *
 * "layout" scope covers the nested `[id]` and `new` segments too, so editing a
 * record refreshes both the detail page and the list it came from.
 */
export function revalidateResource(route: string): void {
  revalidatePath(route, "layout");
}
