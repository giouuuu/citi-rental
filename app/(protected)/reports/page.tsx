import { ReportsScreen } from "@/features/reports";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReportsScreen searchParams={searchParams} />;
}
