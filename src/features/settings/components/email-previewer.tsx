"use client";

import { Paperclip } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmailPreview } from "@/features/settings/services/get-email-preview";

/** Links in the preview open in a new tab instead of inside the frame. */
const withBlankTarget = (html: string) =>
  html.replace("<head>", '<head><base target="_blank">');

export function EmailPreviewer({ previews }: { previews: EmailPreview[] }) {
  return (
    <Tabs defaultValue="rental_completed">
      <TabsList className="h-auto flex-wrap justify-start">
        {previews.map((preview) => (
          <TabsTrigger key={preview.kind} value={preview.kind}>
            {preview.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {previews.map((preview) => (
        <TabsContent className="space-y-3" key={preview.kind} value={preview.kind}>
          <dl className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-[7rem_1fr]">
            <dt className="text-muted-foreground">Sent when</dt>
            <dd>{preview.trigger}</dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="font-medium break-words">{preview.subject}</dd>
            {preview.attachment ? (
              <>
                <dt className="text-muted-foreground">Attachment</dt>
                <dd className="flex items-center gap-1.5">
                  <Paperclip aria-hidden="true" className="size-3.5" /> {preview.attachment}
                </dd>
              </>
            ) : null}
          </dl>
          <iframe
            className="h-[760px] w-full rounded-xl border bg-white"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={withBlankTarget(preview.html)}
            title={`${preview.label} email preview`}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
