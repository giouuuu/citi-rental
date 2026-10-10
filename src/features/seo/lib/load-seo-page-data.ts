import "server-only";

import {
  getPublicFreeCancellationHours,
  getPublicReservationFee,
} from "@/features/booking/services/public-booking-service";
import { formatPhp } from "@/features/shared/lib/money";
import { agreementDeliveryFee } from "@/features/seo/lib/delivery";
import { buildContactChannels } from "@/features/settings/lib/contact-channels";
import { getPublicContactChannels } from "@/features/settings/services/get-public-contact-channels";
import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";

/**
 * Everything a search landing page states as fact, read live: the fleet and
 * its rates, the reservation fee, the cancellation window, and the delivery
 * fee from the rental agreement renters sign — so no page can drift from
 * what the booking flow and the agreement actually charge.
 */
export async function loadSeoPageData(greeting: string) {
  const [vehicles, contact, reservationFee, freeCancellationHours] =
    await Promise.all([
      listPublicAvailableVehicles(),
      getPublicContactChannels(),
      getPublicReservationFee(),
      getPublicFreeCancellationHours(),
    ]);

  const rates = vehicles.map((v) => v.daily_rate).filter((rate) => rate > 0);

  return {
    vehicles,
    reservationFee,
    freeCancellationHours,
    contactChannels: buildContactChannels(contact, greeting),
    fromRate: rates.length ? formatPhp(Math.min(...rates)) : null,
    deliveryFee: agreementDeliveryFee(),
  };
}
