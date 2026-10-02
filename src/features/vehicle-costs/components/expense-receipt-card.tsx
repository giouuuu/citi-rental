import "server-only";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/vehicle-costs/lib/upload-expense-receipt";

/**
 * Shows the stored receipt below the expense edit form via a fresh signed URL.
 * The generic image form field can only preview public `photo_url` columns,
 * so the private receipt gets its own panel.
 */
export async function ExpenseReceiptCard({
  receiptPath,
}: {
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
      <CardHeader className="border-b">
        <CardTitle>Receipt</CardTitle>
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
