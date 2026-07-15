import type { Metadata } from "next";

import { DesignSystemShowcase } from "@/components/design-system/design-system-showcase";
import { PageHeader } from "@/components/design-system/page-header";

export const metadata: Metadata = { title: "Design system" };

export default function DesignSystemPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: "Administration", href: "/settings" },
          { label: "Design system" },
        ]}
        description="Reusable shadcn primitives and application patterns for the City Rentals operational interface."
        eyebrow="Internal preview"
        title="City Rentals design system"
      />
      <DesignSystemShowcase />
    </div>
  );
}
