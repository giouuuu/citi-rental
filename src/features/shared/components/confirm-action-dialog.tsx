"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "destructive",
  icon: Icon,
  error,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  icon?: LucideIcon;
  error?: string;
  onConfirm: () => void;
}) {
  const { isPending } = useMutationCoordinator();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          {Icon ? (
            <AlertDialogMedia>
              <Icon />
            </AlertDialogMedia>
          ) : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <Button disabled={isPending} onClick={onConfirm} variant={variant}>
            {isPending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
