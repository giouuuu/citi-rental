"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloneInspectionTemplateAction } from "@/features/inspections/actions/actions";

export function CloneCategoryTemplateCard({
  category,
}: {
  category: string | null;
}) {
  const [value, setValue] = useState(category ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-semibold">Category checklist template</h3>
        <p className="text-sm text-muted-foreground">
          Clone the standard inspection checklist for this vehicle category
          (admin only). Rentals for matching categories will use it automatically.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="category-template">Vehicle category</Label>
          <Input
            id="category-template"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="invisible">Clone</Label>
          <Button
            disabled={pending || !value.trim()}
            type="button"
            variant="outline"
            onClick={() => {
              setError("");
              setMessage("");
              const data = new FormData();
              data.set("vehicle_category", value.trim());
              startTransition(async () => {
                const result = await cloneInspectionTemplateAction(data);
                if (!result.success) {
                  setError(result.message);
                  return;
                }
                setMessage(`Template ready for “${value.trim()}”.`);
              });
            }}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Clone template
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? <p className="text-sm text-teal-700">{message}</p> : null}
    </div>
  );
}
