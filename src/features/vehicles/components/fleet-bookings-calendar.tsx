"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventInput, EventSourceFuncArg } from "@fullcalendar/core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Combobox } from "@/components/ui/combobox";
import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { normalizeHex, readableTextColor } from "@/features/shared/lib/color";
import { listFleetBookingsAction } from "@/features/vehicles/actions/list-fleet-bookings-action";
import { STATUS_COLOR } from "@/features/vehicles/components/vehicle-bookings-calendar";
import { assignCarColors, fallbackCarColor } from "@/features/vehicles/lib/calendar-color";
import { cn } from "@/lib/utils";
import "./vehicle-bookings-calendar.css";

export type FleetCar = {
  id: string;
  plateNumber: string;
  name: string | null;
  /** Picked on the vehicle form; null gets a palette colour. */
  calendarColor: string | null;
};

const ALL_CARS = "all";

/**
 * Every car's bookings on one month/week grid: plate and renter on each bar,
 * filled with the car's colour and edged with its status, opening the rental
 * on click. Loads only the weeks in view as staff page through months.
 */
export function FleetBookingsCalendar({ cars }: { cars: FleetCar[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const car = searchParams.get("car") ?? ALL_CARS;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inView, setInView] = useState<number | null>(null);
  const carColors = useMemo(() => assignCarColors(cars), [cars]);

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
        .map((booking) => {
          // A retired car is off the list, so it falls back to its own colour.
          const carColor =
            carColors.get(booking.vehicleId) ??
            normalizeHex(booking.vehicleColor) ??
            fallbackCarColor(booking.vehicleId);
          return {
            id: booking.id,
            title: [booking.plateNumber, booking.customerName]
              .filter(Boolean)
              .join(" · "),
            start: booking.startAt,
            end: booking.endAt,
            url: `/rentals/${booking.id}`,
            backgroundColor: carColor,
            textColor: readableTextColor(carColor),
            classNames: ["fleet-car-event", `is-${booking.status}`],
            extendedProps: {
              statusColor: STATUS_COLOR[booking.status] ?? "#6b7280",
              hover: [
                booking.referenceNumber,
                [booking.plateNumber, booking.vehicleName].filter(Boolean).join(" "),
                booking.customerName,
                booking.status,
              ]
                .filter(Boolean)
                .join(" · "),
            },
          };
        });
    },
    [car, carColors],
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
            info.el.style.setProperty(
              "--fleet-status-color",
              String(info.event.extendedProps.statusColor ?? "transparent"),
            );
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
      <div className="space-y-2 text-xs text-muted-foreground">
        {cars.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-medium text-foreground">Cars</span>
            {cars.map((option) => {
              const color = carColors.get(option.id) ?? fallbackCarColor(option.id);
              const selected = car === option.id;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected && "border-foreground bg-muted text-foreground",
                  )}
                  key={option.id}
                  onClick={() => chooseCar(selected ? ALL_CARS : option.id)}
                  title={
                    selected
                      ? "Show all cars"
                      : `Show only ${[option.plateNumber, option.name].filter(Boolean).join(" · ")}`
                  }
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block size-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {option.plateNumber}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-foreground">Status (left edge)</span>
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <span className="flex items-center gap-1.5 capitalize" key={status}>
              <span
                className="inline-block h-3 w-1 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
