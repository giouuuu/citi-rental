"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  ClipboardCheck,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { transitionRentalAction } from "@/features/rentals/actions/actions";
import {
  canTransitionRental,
  type RentalTransitionTarget,
  type RentalWorkflowStatus,
} from "@/features/rentals/lib/booking-gates";
import {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASONS,
  cancellationReasonLabel,
  type CancellationReason,
} from "@/features/rentals/lib/cancellation-reasons";
import {
  cancellationOutcome,
  formatHoursToPickup,
} from "@/features/rentals/lib/cancellation-policy";
import { formatPhpExact } from "@/features/shared/lib/money";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import type { AgreementDraft } from "@/features/agreements/types";
import { RentalInspectionSheet } from "@/features/inspections/components/rental-inspection-sheet";
import { ExtendRentalDialog } from "@/features/rentals/components/extend-rental-dialog";
import type {
  InspectionChecklist,
  RentalInspection,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";
import { toast } from "sonner";
import type { RentRates } from "@/features/rentals/lib/rent-pricing";

/** What the Cancel dialog needs to state the reservation-fee policy. */
export type RentalCancellationContext = {
  startAt: string | null;
  /** Confirmed deposit payments on this rental. */
  depositPaid: number;
  /** Settings → free-cancellation window, in hours before pickup. */
  freeHours: number;
  /** Recorded on a cancelled rental. */
  reason: string | null;
  note: string | null;
  feeForfeited: boolean | null;
};

const ACTIONS: {
  status: RentalTransitionTarget;
  label: string;
  variant: "outline" | "destructive";
  icon: "reserve" | "cancel";
}[] = [
  { status: "reserved", label: "Reserve", variant: "outline", icon: "reserve" },
  {
    status: "cancelled",
    label: "Cancel",
    variant: "destructive",
    icon: "cancel",
  },
];

const TRANSITION_TOAST: Record<RentalTransitionTarget, string> = {
  reserved: "Rental reserved.",
  active: "Rental started.",
  completed: "Rental completed.",
  cancelled: "Rental cancelled.",
};

function ActionIcon({
  icon,
  pending,
}: {
  icon: (typeof ACTIONS)[number]["icon"];
  pending: boolean;
}) {
  if (pending) return <LoaderCircle className="animate-spin" />;
  if (icon === "reserve") return <CalendarCheck2 />;
  return <XCircle />;
}

export function RentalWorkflowActions({
  id,
  status,
  checklist = null,
  knownDamages = [],
  inspections = [],
  startingOdometer = null,
  schedule = null,
  cancellation = null,
  agreementDraft = null,
}: {
  id: string;
  status: RentalWorkflowStatus;
  checklist?: InspectionChecklist | null;
  knownDamages?: VehicleKnownDamage[];
  inspections?: RentalInspection[];
  startingOdometer?: number | null;
  /** Dates and rates the Extend dialog prices the extra time from. */
  schedule?: {
    startAt: string;
    expectedReturnAt: string;
    rates: RentRates | null;
  } | null;
  cancellation?: RentalCancellationContext | null;
  /** The rental agreement prefilled for release. */
  agreementDraft?: AgreementDraft | null;
}) {
  const [error, setError] = useState("");
  const [cancelReason, setCancelReason] = useState<CancellationReason | "">("");
  const [cancelNote, setCancelNote] = useState("");
  const needsNote = cancelReason === "other";
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const hasPickup = inspections.some((row) => row.inspectionType === "pickup");
  const hasReturn = inspections.some((row) => row.inspectionType === "return");
  const pickup = inspections.find((row) => row.inspectionType === "pickup");

  function transition(next: RentalTransitionTarget) {
    if (!canTransitionRental(status, next)) return;

    const data = new FormData();
    data.set("id", id);
    data.set("status", next);
    if (next === "cancelled" && cancelReason) {
      data.set("cancellation_reason", cancelReason);
      if (needsNote) data.set("cancellation_note", cancelNote.trim());
    }

    runMutation(async () => {
      const result = await transitionRentalAction(data);
      if (result.success) {
        setError("");
        toast.success(TRANSITION_TOAST[next]);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const canStart = canTransitionRental(status, "active") && !hasPickup;
  const canComplete = canTransitionRental(status, "completed") && !hasReturn;
  const visible = ACTIONS.filter((action) =>
    canTransitionRental(status, action.status),
  );
  const canExtend =
    schedule != null && (status === "active" || status === "overdue");

  if (visible.length === 0 && !canStart && !canComplete && !canExtend) {
    if (status === "cancelled" && cancellation) {
      return <CancelledSummary cancellation={cancellation} />;
    }
    return (
      <p className="text-sm text-muted-foreground">
        No booking actions available for a {status} rental.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <Alert className="basis-full py-2" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {canStart ? (
        <RentalInspectionSheet
          agreementDraft={agreementDraft}
          checklist={checklist}
          inspectionType="pickup"
          knownDamages={knownDamages}
          rentalId={id}
          startingOdometer={startingOdometer}
          triggerLabel="Start with inspection"
        />
      ) : null}

      {canComplete ? (
        <RentalInspectionSheet
          checklist={checklist}
          inspectionType="return"
          knownDamages={knownDamages}
          referenceInspection={pickup ?? null}
          rentalId={id}
          startingOdometer={startingOdometer}
          triggerLabel="Complete with inspection"
        />
      ) : null}

      {canExtend && schedule ? (
        <ExtendRentalDialog
          rates={schedule.rates}
          expectedReturnAt={schedule.expectedReturnAt}
          rentalId={id}
          startAt={schedule.startAt}
        />
      ) : null}

      {visible.map((action) =>
        action.status === "cancelled" ? (
          <ConfirmActionDialog
            key={action.status}
            confirmLabel="Cancel rental"
            cancelLabel="Keep rental"
            description="The record is kept for history and the vehicle is released for the booked dates."
            error={error}
            icon={XCircle}
            confirmDisabled={!cancelReason || (needsNote && !cancelNote.trim())}
            title="Cancel this rental?"
            trigger={
              <Button disabled={isPending} type="button" variant="destructive">
                <ActionIcon icon={action.icon} pending={isPending} />
                {action.label}
              </Button>
            }
            onConfirm={() => transition("cancelled")}
          >
            <Field>
              <FieldLabel htmlFor="cancellation-reason">Reason</FieldLabel>
              <Combobox
                id="cancellation-reason"
                onValueChange={(value) => setCancelReason(value as CancellationReason)}
                options={CANCELLATION_REASONS}
                placeholder="Choose a reason"
                value={cancelReason}
              />
            </Field>
            {needsNote ? (
              <Field>
                <FieldLabel htmlFor="cancellation-note">Specify the reason</FieldLabel>
                <Textarea
                  id="cancellation-note"
                  maxLength={CANCELLATION_NOTE_MAX}
                  onChange={(event) => setCancelNote(event.target.value)}
                  placeholder="e.g. Flight was rebooked to next week"
                  rows={3}
                  value={cancelNote}
                />
              </Field>
            ) : null}
            {cancellation?.startAt ? (
              <ReservationFeeNotice
                depositPaid={cancellation.depositPaid}
                freeHours={cancellation.freeHours}
                startAt={cancellation.startAt}
              />
            ) : null}
          </ConfirmActionDialog>
        ) : (
          <Button
            key={action.status}
            disabled={isPending}
            type="button"
            variant={action.variant}
            onClick={() => transition(action.status)}
          >
            <ActionIcon icon={action.icon} pending={isPending} />
            {action.label}
          </Button>
        ),
      )}

      {hasPickup || hasReturn ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ClipboardCheck className="size-3.5" />
          {hasPickup && hasReturn
            ? "Pickup & return inspected"
            : hasPickup
              ? "Pickup inspected — use Complete with inspection to finish"
              : "Return inspected"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Tells staff, before they confirm, whether this cancellation keeps the paid
 * reservation fee. Mounts when the dialog opens, so "now" is the moment the
 * dialog was opened.
 */
function ReservationFeeNotice({
  startAt,
  depositPaid,
  freeHours,
}: {
  startAt: string;
  depositPaid: number;
  freeHours: number;
}) {
  const [openedAt] = useState(() => new Date());
  const outcome = cancellationOutcome({
    startAt,
    depositPaid,
    freeHours,
    now: openedAt,
  });
  if (outcome.kind === "no_deposit") return null;

  const fee = formatPhpExact(outcome.depositPaid);
  const limit = `${freeHours}-hour`;

  if (outcome.kind === "forfeited") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Past the {limit} cancellation limit</AlertTitle>
        <AlertDescription>
          This booking is being cancelled{" "}
          {outcome.hoursToPickup > 0
            ? formatHoursToPickup(outcome.hoursToPickup)
            : "after the pickup time"}
          . The {fee} reservation fee already paid will not be refunded.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>Within the free-cancellation window</AlertTitle>
      <AlertDescription>
        Cancelled {formatHoursToPickup(outcome.hoursToPickup)}, at least{" "}
        {freeHours} hours ahead. The {fee} reservation fee can be refunded —
        record the refund on Bill &amp; payments.
      </AlertDescription>
    </Alert>
  );
}

function CancelledSummary({
  cancellation,
}: {
  cancellation: RentalCancellationContext;
}) {
  const reason = cancellationReasonLabel(cancellation.reason);
  const why =
    cancellation.reason === "other" && cancellation.note
      ? cancellation.note
      : [reason, cancellation.note].filter(Boolean).join(" — ");

  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">
        Cancelled{why ? <>: <span className="text-foreground">{why}</span></> : "."}
      </p>
      {cancellation.feeForfeited === true ? (
        <p className="text-muted-foreground">
          Cancelled inside the free-cancellation window — the reservation fee
          is not refunded.
        </p>
      ) : cancellation.feeForfeited === false ? (
        <p className="text-muted-foreground">
          Cancelled in time — the reservation fee is refundable.
        </p>
      ) : null}
    </div>
  );
}
