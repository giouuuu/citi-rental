import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AccountBookingCard } from "@/features/booking/components/account-booking-card";
import type { CustomerBooking } from "@/features/booking/types/customer-booking";

type AccountBookingSectionProps = {
  id: string;
  title: string;
  description: string;
  bookings: CustomerBooking[];
  emptyTitle: string;
  emptyDescription: string;
  showBrowseCta?: boolean;
};

export function AccountBookingSection({
  id,
  title,
  description,
  bookings,
  emptyTitle,
  emptyDescription,
  showBrowseCta = false,
}: AccountBookingSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2
          className="text-lg font-semibold tracking-tight text-brand-950"
          id={headingId}
        >
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {bookings.length > 0 ? (
        <ul className="space-y-3">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <AccountBookingCard booking={booking} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border border-dashed border-border bg-muted/30 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {showBrowseCta ? (
            <EmptyContent>
              <Button asChild>
                <Link href="/#fleet">Browse available cars</Link>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      )}
    </section>
  );
}
