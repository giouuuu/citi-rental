import Link from "next/link";
import { CalendarX2, CarFront, ClipboardList } from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/design-system/status-badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BOOKING_STATUS_LABELS,
  CANCEL_STAGE_LABELS,
  cancelStage,
  type BookingSegment,
  type CarSegment,
} from "@/features/analytics/lib/booking-analytics";
import type { BookingRow } from "@/features/analytics/types/analytics";
import { cancellationReasonLabel } from "@/features/rentals/lib/cancellation-reasons";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";
import type { XlsxColumn } from "@/features/shared/lib/to-xlsx";

const sourceLabel = (row: BookingRow) => (row.bookingSource === "public_web" ? "Website" : "Front desk");
const serviceLabel = (row: BookingRow) => (row.withDriver ? "With driver" : "Self-drive");
const rateLabel = (value: number | null) => (value === null ? "—" : `${value}%`);
const reasonLabel = (row: BookingRow) =>
  cancellationReasonLabel(row.cancellationReason)?.replace(" (specify)", "") ?? "Not recorded";

function EmptyRows({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const SEGMENT_COLUMNS: XlsxColumn[] = [
  { key: "booked", header: "Booked", format: "number" },
  { key: "paid", header: "Paid", format: "number" },
  { key: "cancelled", header: "Cancelled", format: "number" },
  { key: "cancelRate", header: "Cancellation rate", format: "percent" },
  { key: "bookedValue", header: "Booked value", format: "money" },
];

const segmentExportRow = (segment: BookingSegment) => ({
  booked: segment.booked,
  paid: segment.paid,
  cancelled: segment.cancelled,
  cancelRate: segment.cancelRate === null ? null : segment.cancelRate / 100,
  bookedValue: segment.bookedValue,
});

function SegmentCells({ segment }: { segment: BookingSegment }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{segment.booked}</TableCell>
      <TableCell className="text-right tabular-nums">{segment.paid}</TableCell>
      <TableCell className="text-right tabular-nums">{segment.cancelled}</TableCell>
      <TableCell className="text-right tabular-nums">{rateLabel(segment.cancelRate)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPhp(segment.bookedValue)}</TableCell>
    </>
  );
}

function SegmentHeads() {
  return (
    <>
      <TableHead className="text-right">Booked</TableHead>
      <TableHead className="text-right">Paid</TableHead>
      <TableHead className="text-right">Cancelled</TableHead>
      <TableHead className="text-right">Cancel rate</TableHead>
      <TableHead className="text-right">Booked value</TableHead>
    </>
  );
}

/** Website vs front desk and self-drive vs with driver, for bookings made in the period. */
export function ChannelTable({ segments }: { segments: BookingSegment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>By channel and service</CardTitle>
        <CardDescription>
          Bookings made this period. Paid means a payment was confirmed; booked value leaves out
          cancelled bookings.
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="bookings-by-channel"
            sheets={[
              {
                name: "By channel and service",
                columns: [
                  { key: "group", header: "Group" },
                  { key: "label", header: "Segment" },
                  ...SEGMENT_COLUMNS,
                ],
                rows: segments.map((segment, index) => ({
                  group: index < 2 ? "Channel" : "Service",
                  label: segment.label,
                  ...segmentExportRow(segment),
                })),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <SegmentHeads />
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment, index) => (
                <TableRow className={index === 2 ? "border-t-2" : undefined} key={segment.key}>
                  <TableCell className="font-medium">{segment.label}</TableCell>
                  <SegmentCells segment={segment} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Bookings made this period, per car. */
export function CarBookingsTable({ cars }: { cars: CarSegment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>By car</CardTitle>
        <CardDescription>Which cars get booked, and which get cancelled, most.</CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="bookings-by-car"
            sheets={[
              {
                name: "Bookings by car",
                columns: [
                  { key: "plate", header: "Plate number" },
                  { key: "name", header: "Car" },
                  ...SEGMENT_COLUMNS,
                ],
                rows: cars.map((car) => ({ plate: car.plate, name: car.name, ...segmentExportRow(car) })),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {cars.length ? (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Car</TableHead>
                  <SegmentHeads />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cars.map((car) => (
                  <TableRow key={car.key}>
                    <TableCell>
                      <span className="font-medium">{car.plate}</span>
                      {car.name ? (
                        <span className="block text-xs text-muted-foreground">{car.name}</span>
                      ) : null}
                    </TableCell>
                    <SegmentCells segment={car} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRows
            description="Widen the date range to compare cars."
            icon={<CarFront />}
            title="No bookings in this period"
          />
        )}
      </CardContent>
    </Card>
  );
}

const CANCELLATION_COLUMNS: XlsxColumn[] = [
  { key: "referenceNumber", header: "Reference" },
  { key: "customerName", header: "Customer" },
  { key: "customerPhone", header: "Phone" },
  { key: "vehiclePlate", header: "Plate number" },
  { key: "vehicleName", header: "Car" },
  { key: "source", header: "Booked through" },
  { key: "service", header: "Service" },
  { key: "createdAt", header: "Booked at", format: "datetime" },
  { key: "startAt", header: "Pickup", format: "datetime" },
  { key: "cancelledAt", header: "Cancelled at", format: "datetime" },
  { key: "hoursBeforePickup", header: "Hours before pickup", format: "number" },
  { key: "cancelledBy", header: "Cancelled by" },
  { key: "reason", header: "Reason" },
  { key: "cancellationNote", header: "Note" },
  { key: "stage", header: "Payment at cancellation" },
  { key: "paidBeforeCancel", header: "Paid before cancelling", format: "money" },
  { key: "refunded", header: "Refunded", format: "money" },
  { key: "kept", header: "Kept", format: "money" },
  { key: "feeForfeited", header: "Fee forfeited" },
  { key: "quotedTotal", header: "Booking value", format: "money" },
];

function cancellationExportRow(row: BookingRow) {
  const hours = (new Date(row.startAt).getTime() - new Date(row.cancelledAt ?? row.startAt).getTime()) / 3_600_000;
  return {
    referenceNumber: row.referenceNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    vehiclePlate: row.vehiclePlate,
    vehicleName: row.vehicleName,
    source: sourceLabel(row),
    service: serviceLabel(row),
    createdAt: row.createdAt,
    startAt: row.startAt,
    cancelledAt: row.cancelledAt,
    hoursBeforePickup: Math.round(hours * 10) / 10,
    cancelledBy: row.cancelledBy === "customer" ? "Customer, online" : "Staff",
    reason: reasonLabel(row),
    cancellationNote: row.cancellationNote,
    stage: CANCEL_STAGE_LABELS[cancelStage(row)],
    paidBeforeCancel: row.paidBeforeCancel,
    refunded: row.refunded,
    kept: Math.max(0, row.paid),
    feeForfeited: row.reservationFeeForfeited === null ? null : row.reservationFeeForfeited ? "Yes" : "No",
    quotedTotal: row.quotedTotal,
  };
}

/** Every booking cancelled in the period, newest cancellation first. */
export function CancelledBookingsTable({ rows }: { rows: BookingRow[] }) {
  const sorted = [...rows].sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? ""));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancelled bookings</CardTitle>
        <CardDescription>
          Every booking cancelled this period ({rows.length}), with where the payment stood.
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="cancelled-bookings"
            sheets={[
              { name: "Cancelled bookings", columns: CANCELLATION_COLUMNS, rows: sorted.map(cancellationExportRow) },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {sorted.length ? (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Car</TableHead>
                  <TableHead>Cancelled</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Payment at cancellation</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.rentalId}>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/rentals/${row.rentalId}`}>
                        {row.customerName ?? row.referenceNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.referenceNumber} · {sourceLabel(row)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.vehiclePlate ?? "—"}
                      <span className="block text-xs text-muted-foreground">
                        Pickup {formatManila(row.startAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.cancelledAt ? formatManila(row.cancelledAt) : "—"}
                      <span className="block text-xs text-muted-foreground">
                        by {row.cancelledBy === "customer" ? "customer, online" : "staff"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56">
                      {reasonLabel(row)}
                      {row.cancellationNote ? (
                        <span className="block truncate text-xs text-muted-foreground" title={row.cancellationNote}>
                          {row.cancellationNote}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {CANCEL_STAGE_LABELS[cancelStage(row)]}
                      {row.reservationFeeForfeited ? (
                        <span className="block text-xs text-muted-foreground">Fee kept (late cancellation)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(row.refunded)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quotedTotal === null ? "—" : formatPhp(row.quotedTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRows
            description="Nothing was cancelled in this period."
            icon={<CalendarX2 />}
            title="No cancellations"
          />
        )}
      </CardContent>
    </Card>
  );
}

const BOOKING_COLUMNS: XlsxColumn[] = [
  { key: "referenceNumber", header: "Reference" },
  { key: "createdAt", header: "Booked at", format: "datetime" },
  { key: "source", header: "Booked through" },
  { key: "service", header: "Service" },
  { key: "status", header: "Status" },
  { key: "paymentStatus", header: "Payment status", format: "status" },
  { key: "customerName", header: "Customer" },
  { key: "customerPhone", header: "Phone" },
  { key: "vehiclePlate", header: "Plate number" },
  { key: "vehicleName", header: "Car" },
  { key: "vehicleCategory", header: "Category" },
  { key: "startAt", header: "Pickup", format: "datetime" },
  { key: "expectedReturnAt", header: "Return", format: "datetime" },
  { key: "actualReturnAt", header: "Returned at", format: "datetime" },
  { key: "pickupLocation", header: "Pickup location" },
  { key: "destination", header: "Destination" },
  { key: "quotedTotal", header: "Booking value", format: "money" },
  { key: "depositAmount", header: "Reservation fee", format: "money" },
  { key: "paid", header: "Paid (net)", format: "money" },
  { key: "refunded", header: "Refunded", format: "money" },
  { key: "firstProofAt", header: "Payment sent at", format: "datetime" },
  { key: "firstPaidAt", header: "Payment confirmed at", format: "datetime" },
  { key: "cancelledAt", header: "Cancelled at", format: "datetime" },
  { key: "cancelledBy", header: "Cancelled by" },
  { key: "reason", header: "Cancellation reason" },
  { key: "cancellationNote", header: "Cancellation note" },
];

function bookingExportRow(row: BookingRow) {
  const cancelled = row.status === "cancelled";
  return {
    referenceNumber: row.referenceNumber,
    createdAt: row.createdAt,
    source: sourceLabel(row),
    service: serviceLabel(row),
    status: BOOKING_STATUS_LABELS[row.status],
    paymentStatus: row.paymentStatus,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    vehiclePlate: row.vehiclePlate,
    vehicleName: row.vehicleName,
    vehicleCategory: row.vehicleCategory,
    startAt: row.startAt,
    expectedReturnAt: row.expectedReturnAt,
    actualReturnAt: row.actualReturnAt,
    pickupLocation: row.pickupLocation,
    destination: row.destination,
    quotedTotal: row.quotedTotal,
    depositAmount: row.depositAmount,
    paid: row.paid,
    refunded: row.refunded,
    firstProofAt: row.firstProofAt,
    firstPaidAt: row.firstPaidAt,
    cancelledAt: row.cancelledAt,
    cancelledBy: cancelled ? (row.cancelledBy === "customer" ? "Customer, online" : "Staff") : null,
    reason: cancelled ? reasonLabel(row) : null,
    cancellationNote: row.cancellationNote,
  };
}

/** Every booking made in the period, newest first. */
export function BookingsTable({ rows }: { rows: BookingRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>All bookings made this period</CardTitle>
        <CardDescription>
          {rows.length} {rows.length === 1 ? "booking" : "bookings"}, newest first. The Excel file
          has every detail: trip, money, payment times, and cancellation.
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="bookings"
            sheets={[{ name: "Bookings", columns: BOOKING_COLUMNS, rows: rows.map(bookingExportRow) }]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Car</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rentalId}>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/rentals/${row.rentalId}`}>
                        {row.customerName ?? row.referenceNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.referenceNumber} · {sourceLabel(row)} · booked {formatManila(row.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.vehiclePlate ?? "—"}
                      <span className="block text-xs text-muted-foreground">{serviceLabel(row)}</span>
                    </TableCell>
                    <TableCell>
                      {formatManila(row.startAt)}
                      <span className="block text-xs text-muted-foreground">
                        to {formatManila(row.expectedReturnAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={BOOKING_STATUS_LABELS[row.status]} status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quotedTotal === null ? "—" : formatPhp(row.quotedTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(row.paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRows
            description="Widen the date range to see bookings."
            icon={<ClipboardList />}
            title="No bookings made in this period"
          />
        )}
      </CardContent>
    </Card>
  );
}
