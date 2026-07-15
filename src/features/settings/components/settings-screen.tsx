import Link from "next/link";
import { PlugZap, Users } from "lucide-react";
import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import { getOrganizationSettings } from "@/features/settings/services/settings-service";
import { SettingsForm } from "@/features/settings/components/settings-form";
export async function SettingsScreen() {
  const settings = await getOrganizationSettings();
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/settings/users">
                <Users /> Staff users
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/integrations">
                <PlugZap /> Integrations
              </Link>
            </Button>
          </>
        }
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Settings" },
        ]}
        description="Organization identity, tracker health thresholds, and retention defaults."
        title="Settings"
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
