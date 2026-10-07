"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { XlsxSheet } from "@/features/shared/lib/to-xlsx";

/**
 * Downloads rows already on the page as an Excel workbook, built in the
 * browser. For tables that show their whole dataset; a server-paginated list
 * links to a route handler through `ExportButton` instead.
 */
export function ExportRowsButton({
  fileName,
  sheets,
  label = "Export to Excel",
  size = "sm",
}: {
  /** Base name; the download is `<fileName>-<YYYY-MM-DD>.xlsx`. */
  fileName: string;
  sheets: XlsxSheet[];
  label?: string;
  size?: "default" | "sm";
}) {
  const [busy, setBusy] = useState(false);
  const empty = sheets.every((sheet) => sheet.rows.length === 0);

  async function download() {
    setBusy(true);
    try {
      // exceljs is heavy; load it only when someone actually exports.
      const { toXlsx, xlsxFileName } = await import("@/features/shared/lib/to-xlsx");
      const workbook = await toXlsx(sheets);
      const url = URL.createObjectURL(
        new Blob([workbook as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = xlsxFileName(fileName);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error("Couldn't build the Excel file. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button disabled={empty || busy} onClick={download} size={size} type="button" variant="outline">
      <FileSpreadsheet /> {label}
    </Button>
  );
}
