"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CircleAlert, Star } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { submitBookingReviewAction } from "@/features/booking/actions/submit-booking-review-action";
import { BOOKING_REVIEW_MAX_LENGTH } from "@/features/booking/schemas/booking-review-schema";
import { cn } from "@/lib/utils";

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/**
 * Stars as native radios: arrow keys move between them and screen readers
 * read "4 stars, Very good" without any extra wiring.
 */
function StarPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-3">
      <div className="flex" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            className="cursor-pointer rounded-md p-1 has-focus-visible:ring-2 has-focus-visible:ring-ring"
            key={star}
            onPointerEnter={() => setHover(star)}
          >
            <input
              checked={value === star}
              className="sr-only"
              name={name}
              onChange={() => onChange(star)}
              type="radio"
              value={star}
            />
            <span className="sr-only">
              {star} {star === 1 ? "star" : "stars"}, {RATING_WORDS[star]}
            </span>
            <Star
              aria-hidden="true"
              className={cn(
                "size-8 transition-[color,fill,transform] duration-150 ease-out motion-safe:active:scale-90",
                star <= shown ? "fill-gold-500 text-gold-500" : "fill-transparent text-border",
              )}
            />
          </label>
        ))}
      </div>
      <span aria-hidden="true" className="min-w-20 text-sm font-medium text-muted-foreground">
        {RATING_WORDS[shown] ?? ""}
      </span>
    </div>
  );
}

/** Rate a returned trip. Saved hidden; the owner publishes it on the homepage. */
export function BookingReviewForm({
  rentalId,
  vehicleName,
}: {
  rentalId: string;
  vehicleName: string;
}) {
  const router = useRouter();
  const bodyId = useId();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    startTransition(async () => {
      const result = await submitBookingReviewAction({ rentalId, rating, body });
      if (!result.success) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setFormError(result.message);
        return;
      }
      setFieldErrors({});
      toast.success("Thanks for your review!", {
        description: "It shows on our website once we've had a look.",
      });
      router.refresh();
    });
  }

  const ratingError = fieldErrors.rating?.[0];
  const bodyError = fieldErrors.body?.[0];

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      <FieldSet data-invalid={ratingError ? true : undefined}>
        <FieldLegend variant="label">How was your trip in the {vehicleName}?</FieldLegend>
        <StarPicker
          name="rating"
          onChange={(value) => {
            setRating(value);
            setFieldErrors((errors) => ({ ...errors, rating: undefined }));
          }}
          value={rating}
        />
        {ratingError ? <FieldError>{ratingError}</FieldError> : null}
      </FieldSet>

      <Field data-invalid={bodyError ? true : undefined}>
        <FieldLabel htmlFor={bodyId}>Your review</FieldLabel>
        <Textarea
          aria-invalid={bodyError ? true : undefined}
          id={bodyId}
          maxLength={BOOKING_REVIEW_MAX_LENGTH}
          name="body"
          onChange={(event) => setBody(event.target.value)}
          placeholder="The car, the pickup, how we did…"
          rows={4}
          value={body}
        />
        {bodyError ? (
          <FieldError>{bodyError}</FieldError>
        ) : (
          <FieldDescription>
            We may show it on our homepage with your first name and last initial.
          </FieldDescription>
        )}
      </Field>

      {formError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Button disabled={pending} type="submit">
        {pending ? <Spinner /> : null}
        Send review
      </Button>
    </form>
  );
}
