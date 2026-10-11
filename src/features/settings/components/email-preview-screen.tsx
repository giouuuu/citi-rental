import Link from "next/link";
import { Settings } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import { EmailPreviewer } from "@/features/settings/components/email-previewer";
import { getEmailPreviews } from "@/features/settings/services/get-email-preview";

export async function EmailPreviewScreen() {
  const previews = await getEmailPreviews();
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/settings#after-trip-title">
              <Settings /> Edit thank-you and review links
            </Link>
          </Button>
        }
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Customer emails" },
        ]}
        description="What customers receive, rendered with a sample booking and your current Settings. Save Settings, then reload to see changes."
        title="Customer emails"
      />
      <EmailPreviewer previews={previews} />
    </div>
  );
}
