"use client";

import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResourceForm } from "@/features/shared/components/resource-form";
import type { ResourceFormProps } from "@/features/shared/types/resource-form";

/**
 * A resource form opened in place — record an expense from the vehicle page
 * without leaving it. Closes and refreshes the page on success; errors stay
 * inline in the dialog.
 */
export function ResourceFormDialog({
  open,
  onOpenChange,
  title,
  description,
  ...form
}: Omit<ResourceFormProps, "onSuccess" | "bare"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}) {
  const router = useRouter();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* Remounted on every open so the form starts from its initial values. */}
        {open ? (
          <ResourceForm
            {...form}
            bare
            onSuccess={() => {
              onOpenChange(false);
              router.refresh();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
