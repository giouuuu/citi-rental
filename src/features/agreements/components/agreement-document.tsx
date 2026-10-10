import Image from "next/image";

import type { AgreementTerms } from "@/features/agreements/lib/agreement-template";
import type { AgreementParties } from "@/features/agreements/types";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";

function SignatureLine({
  url,
  alt,
  placeholder,
}: {
  url: string | null;
  alt: string;
  placeholder: string;
}) {
  return (
    <div className="flex h-20 items-end justify-center border-b border-foreground/60">
      {url ? (
        // Signatures are dark ink, saved on white (older ones) or clear.
        // Multiply drops the white in light mode; in dark mode the ink is
        // inverted to light and screen drops the background.
        <Image
          alt={alt}
          className="h-[4.5rem] w-auto max-w-full object-contain object-bottom mix-blend-multiply dark:mix-blend-screen dark:invert"
          height={72}
          src={url}
          unoptimized
          width={260}
        />
      ) : (
        <span className="pb-1 text-xs text-muted-foreground italic">{placeholder}</span>
      )}
    </div>
  );
}

function FormLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <FormLine label={label}>
      <p className="min-h-6 border-b border-foreground/30 pb-0.5 font-medium">
        {value || "—"}
      </p>
    </FormLine>
  );
}

/**
 * One signing party: signature over printed name, then their details, with
 * the date pinned to the bottom so both columns line up.
 */
function PartyBlock({
  title,
  name,
  signature,
  details,
  date,
}: {
  title: string;
  name: string;
  signature: React.ReactNode;
  details?: React.ReactNode;
  date: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div>
        {signature}
        <p className="pt-1 text-center font-semibold uppercase">{name || "—"}</p>
        <p className="text-center text-[11px] text-muted-foreground">
          Signature over printed name
        </p>
      </div>
      {details}
      <div className="mt-auto">
        <Line label="Date" value={date} />
      </div>
    </div>
  );
}

/**
 * The rental agreement and cancellation policy, filled in. Used for the live
 * preview at release and for the signed, printable copy.
 */
export function AgreementDocument({
  terms,
  parties,
  companySignatureUrl,
  renterSignatureUrl,
  signedAt,
  className,
}: {
  terms: AgreementTerms;
  parties: AgreementParties;
  companySignatureUrl: string | null;
  renterSignatureUrl: string | null;
  /** Null until signed: the date lines then show when it will be dated. */
  signedAt: string | null;
  className?: string;
}) {
  const dateLabel = signedAt ? formatManila(signedAt, "stamp") : "Dated at release";
  const period =
    parties.startAt && parties.expectedReturnAt
      ? `${formatManila(parties.startAt, "stamp")} – ${formatManila(parties.expectedReturnAt, "stamp")}`
      : null;
  const vehicle = [parties.vehicleLabel, parties.plateNumber]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={cn("space-y-6 text-sm leading-relaxed text-foreground", className)}>
      <header className="space-y-0.5 text-center">
        <h1 className="text-lg font-semibold tracking-wide uppercase">
          {parties.companyName}
        </h1>
        {parties.companyAddress ? <p className="text-xs">{parties.companyAddress}</p> : null}
        {parties.companyPhone ? (
          <p className="text-xs">Phone: {parties.companyPhone}</p>
        ) : null}
        {parties.companyEmail ? (
          <p className="text-xs">Email: {parties.companyEmail}</p>
        ) : null}
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 className="text-base font-semibold uppercase">{terms.title}</h2>
          {parties.rentalReference ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              Ref. {parties.rentalReference}
            </span>
          ) : null}
        </div>
        {vehicle || period ? (
          <dl className="grid gap-1 rounded-md bg-muted/50 p-3 text-xs sm:grid-cols-2">
            {vehicle ? (
              <div>
                <dt className="text-muted-foreground">Vehicle</dt>
                <dd className="font-medium">{vehicle}</dd>
              </div>
            ) : null}
            {period ? (
              <div>
                <dt className="text-muted-foreground">Rental period</dt>
                <dd className="font-medium">{period}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <AgreementClauses terms={terms} />
      </section>

      <AgreementRules terms={terms} />

      <section className="space-y-4 break-inside-avoid">
        <div className="space-y-1">
          <h3 className="font-semibold uppercase">Acknowledgement</h3>
          <p>{terms.acknowledgement}</p>
        </div>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          <PartyBlock
            date={dateLabel}
            name={parties.companyName}
            signature={
              <SignatureLine
                alt="Company signature"
                placeholder="Company signature"
                url={companySignatureUrl}
              />
            }
            title="Car rental company"
          />
          <PartyBlock
            date={dateLabel}
            details={
              <>
                <Line
                  label="Driver's license no."
                  value={parties.renterLicenseNumber || "Not required (with driver)"}
                />
                <Line label="Address" value={parties.renterAddress} />
              </>
            }
            name={parties.renterName}
            signature={
              <SignatureLine
                alt="Renter signature"
                placeholder="Renter signs at release"
                url={renterSignatureUrl}
              />
            }
            title="Renter"
          />
        </div>
      </section>

      <AgreementCancellationPolicy
        className="border-t border-border pt-5 print:break-before-page print:border-0 print:pt-0"
        terms={terms}
      />
    </article>
  );
}

/** The opening clauses. Shared with the terms renters accept when booking. */
export function AgreementClauses({ terms }: { terms: AgreementTerms }) {
  return (
    <>
      <p>{terms.intro}</p>
      <ul className="list-disc space-y-1.5 pl-5">
        {terms.clauses.map((clause) => (
          <li key={clause}>{clause}</li>
        ))}
      </ul>
    </>
  );
}

/** Penalties through reminders: the rules between the clauses and signatures. */
export function AgreementRules({ terms }: { terms: AgreementTerms }) {
  return (
    <>
      <section className="space-y-2">
        <h3 className="font-semibold uppercase">{terms.penalties.heading}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {terms.penalties.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold uppercase">Fines</h3>
        <table className="w-full max-w-md text-sm">
          <tbody>
            {terms.fines.map((fine) => (
              <tr key={fine.label} className="border-b border-border last:border-0">
                <td className="py-1 pr-4">{fine.label}</td>
                <td className="py-1 text-right font-medium tabular-nums">
                  {formatPhp(fine.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold uppercase">Other charges</h3>
        {terms.otherCharges.map((charge) => (
          <p key={charge.label}>
            <span className="font-medium">{charge.label}:</span> {charge.detail}
          </p>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold uppercase">Prohibited use</h3>
        <p>{terms.prohibitedUse.intro}</p>
        <ul className="list-disc space-y-1 pl-5">
          {terms.prohibitedUse.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{terms.prohibitedUse.closing}</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold uppercase">Additional reminders</h3>
        <ul className="list-disc space-y-1 pl-5">
          {terms.reminders.map((reminder) => (
            <li key={reminder.label}>
              <span className="font-medium">{reminder.label}:</span> {reminder.text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function AgreementCancellationPolicy({
  terms,
  className,
}: {
  terms: AgreementTerms;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-base font-semibold uppercase">{terms.cancellation.title}</h2>
      <p>{terms.cancellation.intro}</p>
      <ol className="space-y-2">
        {terms.cancellation.sections.map((section, index) => (
          <li key={section.heading}>
            <p className="font-semibold">
              {index + 1}. {section.heading}
            </p>
            <p>{section.body}</p>
          </li>
        ))}
      </ol>
      <p>{terms.cancellation.closing}</p>
    </section>
  );
}
