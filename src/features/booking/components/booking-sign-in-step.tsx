import { Check } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import {
  bookingContinuePerks,
  bookingFormPath,
  type BookingContinueQuery,
} from "@/features/booking/lib/booking-continue";

type BookingSignInStepProps = {
  vehicleId: string;
  vehicleName: string;
  query?: BookingContinueQuery;
};

/**
 * Booking needs an account. Signing in (Google creates one on the spot)
 * returns to the booking form with the trip carried along.
 */
export function BookingSignInStep({
  vehicleId,
  vehicleName,
  query = {},
}: BookingSignInStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm leading-6 text-muted-foreground">
          Sign in to reserve{" "}
          <span className="font-medium text-foreground">{vehicleName}</span>.
        </p>
        <ul className="mt-3 space-y-2">
          {bookingContinuePerks.signedIn.map((item) => (
            <li
              className="flex gap-2 text-sm leading-5 text-muted-foreground"
              key={item}
            >
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-teal-700"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <LoginForm embedded nextPath={bookingFormPath(vehicleId, query)} />
    </div>
  );
}
