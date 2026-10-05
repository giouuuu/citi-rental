import { redirect } from "next/navigation";

/**
 * Stable entry point into the ops app. Lives in `(protected)` so the layout's
 * owner/admin gate applies before the hop to the dashboard.
 */
export default function AdminEntryPage() {
  redirect("/dashboard");
}
