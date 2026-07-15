"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-danger-surface text-destructive">
        <TriangleAlert className="size-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">
        This view could not be loaded
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        The workspace is still available. Retry this view, or return to it after
        checking the integration status.
      </p>
      <Button className="mt-5" onClick={unstable_retry}>
        <RefreshCw /> Retry
      </Button>
    </div>
  );
}
