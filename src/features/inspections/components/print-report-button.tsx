"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportButton() {
  return (
    <Button
      className="print:hidden"
      size="sm"
      type="button"
      variant="outline"
      onClick={() => window.print()}
    >
      <Printer /> Print
    </Button>
  );
}
