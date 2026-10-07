"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { removeExpenseReceiptAction } from "@/features/vehicle-costs/actions/remove-expense-receipt-action";

export function RemoveReceiptButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [error, setError] = useState<string>();

  function remove() {
    runMutation(async () => {
      const result = await removeExpenseReceiptAction(expenseId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success("Receipt removed.");
      router.refresh();
    });
  }

  return (
    <ConfirmActionDialog
      confirmLabel="Remove receipt"
      description="The expense stays; only the photo is deleted. You can attach a new one from the form above."
      error={error}
      icon={Trash2}
      title="Remove this receipt photo?"
      trigger={
        <Button disabled={isPending} size="sm" type="button" variant="outline">
          <Trash2 />
          Remove receipt
        </Button>
      }
      onConfirm={remove}
    />
  );
}
