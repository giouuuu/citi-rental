import { History } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RentalTimelineStepper } from "@/features/rentals/components/rental-timeline-stepper";
import { getRentalTimeline } from "@/features/rentals/services/get-rental-timeline";

export async function RentalTimeline({ rentalId }: { rentalId: string }) {
  const events = await getRentalTimeline(rentalId);

  if (events.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>
            Bookings, payments, pickups and returns show up here as they happen.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <RentalTimelineStepper events={events} />;
}
