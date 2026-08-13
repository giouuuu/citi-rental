"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import type { ActionResult } from "@/features/shared/types/resource";

export function ArchiveButton({
  id,
  label,
  href,
  action,
  successMessage,
}: {
  id: string;
  label: string;
  href: string;
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage: string;
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
        toast.success(successMessage);
        router.replace(href);
      } else {
        setError(result.message);
      }
    });
  }
  return (
    <ConfirmActionDialog
      cancelLabel="Keep active"
      confirmLabel={label}
      description="This removes the record from active workflows while preserving its history."
      error={error}
      icon={Archive}
      title={`${label}?`}
      trigger={
        <Button disabled={isPending} variant="outline">
          <Archive /> {label}
        </Button>
      }
      onConfirm={archive}
    />
  );
}
