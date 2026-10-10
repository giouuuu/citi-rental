"use client";

import { useCallback, useState } from "react";
import { FileText } from "lucide-react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  AgreementCancellationPolicy,
  AgreementClauses,
  AgreementRules,
} from "@/features/agreements/components/agreement-document";
import { buildAgreementTerms } from "@/features/agreements/lib/agreement-template";
import { DEFAULT_FREE_CANCELLATION_HOURS } from "@/features/booking/lib/cancellation-policy";

/** Close enough to the end of the terms to count as read. */
const READ_THRESHOLD_PX = 24;

/**
 * The rental agreement and cancellation policy the renter signs at pickup,
 * accepted up front. The box only ticks once the terms were opened and
 * scrolled to the end; until then, ticking it opens them.
 */
export function BookingTermsField<
  T extends FieldValues,
  TOut extends FieldValues = T,
>({
  control,
  name,
  freeCancellationHours,
  disabled,
}: {
  control: Control<T, unknown, TOut>;
  name: FieldPath<T>;
  freeCancellationHours?: number | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const terms = buildAgreementTerms({
    freeCancellationHours:
      freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS,
  });

  const checkEnd = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      READ_THRESHOLD_PX
    ) {
      setReachedEnd(true);
    }
  }, []);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        // A restored draft that was already ticked counts as read.
        const hasRead = read || field.value === true;
        return (
          <>
            <Field data-invalid={fieldState.invalid} orientation="horizontal">
              <Checkbox
                aria-invalid={fieldState.invalid}
                checked={field.value === true}
                disabled={disabled}
                id={String(name)}
                name={field.name}
                onBlur={field.onBlur}
                onCheckedChange={(checked) => {
                  if (!hasRead) {
                    setOpen(true);
                    return;
                  }
                  field.onChange(checked === true);
                }}
                ref={field.ref}
              />
              <FieldContent>
                <FieldLabel className="font-normal" htmlFor={String(name)}>
                  I have read and agree to the rental terms and the
                  cancellation policy.
                </FieldLabel>
                <FieldDescription>
                  <button
                    className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    type="button"
                  >
                    Read the terms and conditions
                  </button>
                  {hasRead ? null : " before you tick the box."}
                </FieldDescription>
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </FieldContent>
            </Field>

            <Dialog onOpenChange={setOpen} open={open}>
              <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 p-0 sm:max-w-2xl">
                <DialogHeader className="border-b border-border px-5 pt-5 pb-4">
                  <DialogTitle className="flex items-center gap-2">
                    <FileText aria-hidden="true" className="size-4" />
                    Terms and conditions
                  </DialogTitle>
                  <DialogDescription>
                    The same agreement you sign when you pick up the car.
                    Scroll to the end to agree.
                  </DialogDescription>
                </DialogHeader>
                <div
                  className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed"
                  onScroll={(event) => checkEnd(event.currentTarget)}
                  // Short enough to need no scrolling: it is all in view.
                  ref={checkEnd}
                  tabIndex={0}
                >
                  <AgreementCancellationPolicy
                    className="rounded-lg bg-brand-50/70 p-4"
                    terms={terms}
                  />
                  <section className="space-y-3">
                    <h2 className="text-base font-semibold uppercase">
                      {terms.title}
                    </h2>
                    <AgreementClauses terms={terms} />
                  </section>
                  <AgreementRules terms={terms} />
                  <p>{terms.acknowledgement}</p>
                </div>
                <DialogFooter className="border-t border-border px-5 py-4">
                  <Button
                    onClick={() => setOpen(false)}
                    type="button"
                    variant="outline"
                  >
                    Close
                  </Button>
                  <Button
                    disabled={!reachedEnd}
                    onClick={() => {
                      setRead(true);
                      field.onChange(true);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {reachedEnd ? "I agree" : "Scroll to the end to agree"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    />
  );
}
