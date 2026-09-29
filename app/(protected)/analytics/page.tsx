import type { Metadata } from "next";

import { AnalyticsScreen } from "@/features/analytics";

export const metadata: Metadata = { title: "Analytics" };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AnalyticsScreen searchParams={searchParams} />;
}
