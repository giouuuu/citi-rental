import type { Metadata } from "next";

import { FinanceScreen } from "@/features/finance";

export const metadata: Metadata = { title: "Accountant report" };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FinanceScreen searchParams={searchParams} />;
}
