"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <Button onClick={copy} size="sm" type="button" variant="outline">
      <Copy /> Copy
    </Button>
  );
}
