import { AlertDetailScreen } from "@/features/alerts";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ acknowledged?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <AlertDetailScreen acknowledged={query.acknowledged === "1"} id={id} />
  );
}
