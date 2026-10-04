import type { Metadata } from "next";

import { TaxSettingsScreen } from "@/features/finance";

export const metadata: Metadata = { title: "Tax settings" };

export default function Page() {
  return <TaxSettingsScreen />;
}
