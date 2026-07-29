import { notFound, redirect } from "next/navigation";

import { BookingContinueChoice } from "@/features/booking/components/booking-continue-choice";
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
      description="Sign in for trip tracking, or continue as a guest with the same booking steps."
      title="How do you want to continue?"
    >
      <BookingContinueChoice
        compact
        query={bookingQuery}
        vehicleId={vehicleId}
        vehicleName={vehicle.name}
      />
    </RouteModal>
  );
}
