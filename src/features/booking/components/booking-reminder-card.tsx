import Image from "next/image";
import Link from "next/link";
import { CarFront, ChevronRight } from "lucide-react";

import type {
  BookingReminder,
  BookingReminderKind,
} from "@/features/booking/lib/booking-reminder";
import { cn } from "@/lib/utils";

const TITLE: Record<BookingReminderKind, string> = {
  pay: "Finish your booking",
  "proof-review": "Payment under review",
  upcoming: "Your next trip",
  "on-trip": "On the road",
  overdue: "Return overdue",
};

/**
 * Signed-in renters with a live booking see it above the landing search: a
 * small chip that opens payment for an unfinished one, or the trip they have.
 */
export function BookingReminderCard({
  reminder,
  className,
}: {
  reminder: BookingReminder;
  className?: string;
}) {
  const { booking, kind, href } = reminder;
  const title = TITLE[kind];
  const vehicleLabel =
    booking.vehicleName ||
    [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(" ") ||
    "Your car";

  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      <Link
        className="group flex w-fit max-w-full items-center gap-3 rounded-2xl bg-card/90 p-1.5 pr-3 shadow-[0_20px_40px_-28px_rgb(7_17_31/0.35)] ring-1 ring-brand-950/[0.06] backdrop-blur-md transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={href}
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-600">
          {booking.vehiclePhotoUrl ? (
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="40px"
              src={booking.vehiclePhotoUrl}
            />
          ) : (
            <CarFront aria-hidden="true" className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block text-xs font-semibold",
              kind === "overdue" ? "text-destructive" : "text-teal-700",
            )}
          >
            {title}
          </span>
          <span className="block truncate text-sm font-semibold text-brand-950">
            {vehicleLabel}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}
