"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type InspectionReviewRow = {
  label: string;
  value: string;
  /** `strong` totals a section; `warn` flags money still owed. */
  tone?: "strong" | "warn";
};

/**
 * The last look before a release or return is saved: what is about to be
 * recorded, and a checkbox staff tick to say they understand it.
 */
export function InspectionReviewDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
  understanding,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rows: InspectionReviewRow[];
  understanding: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [understood, setUnderstood] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Every opening asks again.
        if (!next) setUnderstood(false);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ClipboardCheck />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "flex justify-between gap-3",
                row.tone === "strong" && "border-t border-border pt-2 font-semibold",
                row.tone === "warn" && "font-semibold text-destructive",
              )}
            >
              <dt className={row.tone ? undefined : "text-muted-foreground"}>
                {row.label}
              </dt>
              <dd className="text-right tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>

        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
          <Checkbox
            checked={understood}
            onCheckedChange={(value) => setUnderstood(value === true)}
          />
          <span>{understanding}</span>
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <Button
            disabled={!understood}
            type="button"
            onClick={() => {
              setUnderstood(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
