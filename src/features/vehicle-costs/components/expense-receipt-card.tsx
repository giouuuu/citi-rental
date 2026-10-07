import "server-only";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { RemoveReceiptButton } from "@/features/vehicle-costs/components/remove-receipt-button";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/vehicle-costs/lib/upload-expense-receipt";

/**
 * Shows the stored receipt below the expense edit form via a fresh signed URL.
 * The generic image form field can only preview public `photo_url` columns,
 * so the private receipt gets its own panel.
 */
export async function ExpenseReceiptCard({
  expenseId,
  receiptPath,
}: {
  expenseId: string;
  receiptPath: string | null;
}) {
  if (!receiptPath || !isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: signed } = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(receiptPath, 60 * 30);
  if (!signed?.signedUrl) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b">
        <CardTitle>Receipt</CardTitle>
        <RemoveReceiptButton expenseId={expenseId} />
      </CardHeader>
      <CardContent className="pt-6">
        <a href={signed.signedUrl} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Expense receipt"
            className="h-64 w-full max-w-md rounded-lg border object-contain"
            src={signed.signedUrl}
          />
        </a>
      </CardContent>
    </Card>
  );
}
