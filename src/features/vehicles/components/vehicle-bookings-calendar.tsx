"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { VehicleRental } from "@/features/vehicles/services/list-vehicle-rentals";
import "./vehicle-bookings-calendar.css";

const STATUS_COLOR: Record<string, string> = {
  reserved: "#ca8a04",
  active: "#16a34a",
  overdue: "#dc2626",
  completed: "#6b7280",
};

export function VehicleBookingsCalendar({
  rentals,
}: {
  rentals: VehicleRental[];
}) {
  const events = rentals.map((r) => ({
    id: r.id,
    title: [r.reference_number, r.customer_name].filter(Boolean).join(" · "),
    start: r.start_at,
    end: r.expected_return_at,
    backgroundColor: STATUS_COLOR[r.status] ?? "#6b7280",
    borderColor: STATUS_COLOR[r.status] ?? "#6b7280",
    extendedProps: { status: r.status },
  }));

  return (
    <div className="vehicle-bookings-calendar">
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,dayGridWeek",
        }}
        events={events}
        eventDisplay="block"
        displayEventTime={false}
        height="auto"
        dayMaxEvents={3}
      />
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5 capitalize">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {status}
          </span>
        ))}
      </div>
    </div>
  );
}
