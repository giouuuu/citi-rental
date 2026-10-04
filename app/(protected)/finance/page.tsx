import type { Metadata } from "next";

import { ProfitOverviewScreen } from "@/features/finance";

export const metadata: Metadata = { title: "Profit overview" };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProfitOverviewScreen searchParams={searchParams} />;
}
