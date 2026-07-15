"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";

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
import type { ActionResult } from "@/features/shared/types/resource";

export function ArchiveButton({
  id,
  label,
  href,
  action,
}: {
  id: string;
  label: string;
  href: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  function archive() {
    const formData = new FormData();
    formData.set("id", id);
    runMutation(async () => {
      const result = await action(formData);
      if (result.success) {
        setError("");
        router.replace(href);
      } else {
        setError(result.message);
      }
    });
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={isPending} variant="outline">
          <Archive /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Archive />
          </AlertDialogMedia>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the record from active workflows while preserving its
            history.
          </AlertDialogDescription>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep active</AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={archive}
            variant="destructive"
          >
            {isPending ? "Working…" : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
