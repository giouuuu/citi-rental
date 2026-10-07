"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventInput, EventSourceFuncArg } from "@fullcalendar/core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Combobox } from "@/components/ui/combobox";
import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { listFleetBookingsAction } from "@/features/vehicles/actions/list-fleet-bookings-action";
import { STATUS_COLOR } from "@/features/vehicles/components/vehicle-bookings-calendar";
import "./vehicle-bookings-calendar.css";

export type FleetCar = { id: string; plateNumber: string; name: string | null };

const ALL_CARS = "all";

/**
 * Every car's bookings on one month/week grid: plate and renter on each bar,
 * colored by status, opening the rental on click. Loads only the weeks in
 * view as staff page through months.
 */
export function FleetBookingsCalendar({ cars }: { cars: FleetCar[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const car = searchParams.get("car") ?? ALL_CARS;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inView, setInView] = useState<number | null>(null);

  const loadEvents = useCallback(
    async (range: EventSourceFuncArg): Promise<EventInput[]> => {
      const result = await listFleetBookingsAction({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
      if (!result.success) {
        setError(result.message);
        return [];
      }
      setError("");
      return (result.data ?? [])
        .filter((booking) => car === ALL_CARS || booking.vehicleId === car)
        .map((booking) => ({
          id: booking.id,
          title: [booking.plateNumber, booking.customerName]
            .filter(Boolean)
            .join(" · "),
          start: booking.startAt,
          end: booking.endAt,
          url: `/rentals/${booking.id}`,
          backgroundColor: STATUS_COLOR[booking.status] ?? "#6b7280",
          borderColor: STATUS_COLOR[booking.status] ?? "#6b7280",
          extendedProps: {
            hover: [
              booking.referenceNumber,
              [booking.plateNumber, booking.vehicleName].filter(Boolean).join(" "),
              booking.customerName,
              booking.status,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        }));
    },
    [car],
  );

  function chooseCar(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL_CARS) params.delete("car");
    else params.set("car", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="w-full sm:w-72">
          <Combobox
            aria-label="Show bookings for"
            onValueChange={chooseCar}
            options={[
              { value: ALL_CARS, label: "All cars" },
              ...cars.map((option) => ({
                value: option.id,
                label: [option.plateNumber, option.name].filter(Boolean).join(" · "),
              })),
            ]}
            searchPlaceholder="Search cars…"
            value={car}
          />
        </div>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {inView === null
            ? ""
            : inView === 0
              ? "No bookings in view."
              : `${inView} ${inView === 1 ? "booking" : "bookings"} in view`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DataTableLoadingBar pending={loading} />
      <div className="vehicle-bookings-calendar">
        <FullCalendar
          dayMaxEvents={4}
          displayEventTime={false}
          eventClick={(info) => {
            // Client navigation, not a full page load; the link stays for
            // open-in-new-tab.
            info.jsEvent.preventDefault();
            if (info.event.url) router.push(info.event.url);
          }}
          eventDidMount={(info) => {
            info.el.title = String(info.event.extendedProps.hover ?? info.event.title);
          }}
          eventDisplay="block"
          events={loadEvents}
          eventsSet={(events) => setInView(events.length)}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,dayGridWeek",
          }}
          height="auto"
          initialView="dayGridMonth"
          key={car}
          loading={setLoading}
          plugins={[dayGridPlugin]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <span className="flex items-center gap-1.5 capitalize" key={status}>
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
