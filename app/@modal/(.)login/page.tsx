import { LoginForm } from "@/components/auth/login-form";
import { RouteModal } from "@/features/booking/components/route-modal";

type InterceptedLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InterceptedLoginPage({
  searchParams,
}: InterceptedLoginPageProps) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextPath = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const isBookingReturn =
    typeof nextPath === "string" && nextPath.startsWith("/book/");

  return (
    <RouteModal
      description={
        isBookingReturn
          ? "Sign in to continue your reservation. Close to go back."
          : "Sign in to continue. Close to go back."
      }
      footer={null}
      title="Sign in"
    >
      <LoginForm embedded nextPath={nextPath} />
    </RouteModal>
  );
}
