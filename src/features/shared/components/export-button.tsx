import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Downloads a table as an Excel workbook from a route handler that answers
 * with `content-disposition: attachment`, so the page never navigates.
 * Disabled when the table has nothing to export.
 */
export function ExportButton({
  href,
  disabled = false,
  label = "Export to Excel",
  size = "default",
}: {
  href: string;
  disabled?: boolean;
  label?: string;
  size?: "default" | "sm";
}) {
  if (disabled) {
    return (
      <Button disabled size={size} variant="outline">
        <FileSpreadsheet /> {label}
      </Button>
    );
  }
  return (
    <Button asChild size={size} variant="outline">
      <a download href={href}>
        <FileSpreadsheet /> {label}
      </a>
    </Button>
  );
}
