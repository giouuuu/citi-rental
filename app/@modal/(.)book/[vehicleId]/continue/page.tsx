import { notFound, redirect } from "next/navigation";

import { BookingSignInStep } from "@/features/booking/components/booking-sign-in-step";
import { RouteModal } from "@/features/booking/components/route-modal";
import { bookingFormPath } from "@/features/booking/lib/booking-continue";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import { getPublicVehicle } from "@/features/booking/services/public-booking-service";

type InterceptedContinuePageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
  }>;
};

export default async function InterceptedBookContinuePage({
  params,
  searchParams,
}: InterceptedContinuePageProps) {
  const { vehicleId } = await params;
  const query = await searchParams;
  const bookingQuery = {
    pickup: query.pickup,
    start: query.start,
    end: query.end,
    mode: query.mode,
  };

  if (await isBookingUserSignedIn()) {
    redirect(bookingFormPath(vehicleId, bookingQuery));
  }

  const vehicle = await getPublicVehicle(vehicleId);

  if (!vehicle) notFound();

  if (vehicle.status === "maintenance" || vehicle.status === "inactive") {
    return (
      <RouteModal
        description="This car cannot be reserved right now."
        title="Car unavailable"
      >
        <p className="text-sm text-muted-foreground">
          This car is not available for booking. Close this dialog and pick
          another from the fleet.
        </p>
      </RouteModal>
    );
  }

  return (
    <RouteModal
      description="Booking needs an account so you can track your reservation."
      title="Sign in to book"
    >
      <BookingSignInStep
        query={bookingQuery}
        vehicleId={vehicleId}
        vehicleName={vehicle.name}
      />
    </RouteModal>
  );
}
