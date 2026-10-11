import Image from "next/image";

import {
  type AgreementPolicy,
  type AgreementSection,
  type AgreementTerms,
  isEmptyPolicy,
  isEmptySection,
} from "@/features/agreements/lib/agreement-template";
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
 * The rental agreement and its policies, filled in. Used for the live
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
        {terms.acknowledgement ? (
          <div className="space-y-1">
            <h3 className="font-semibold uppercase">Acknowledgement</h3>
            <p>{terms.acknowledgement}</p>
          </div>
        ) : null}
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

      {agreementPolicies(terms).length ? (
        <AgreementPolicies
          className="space-y-6 border-t border-border pt-5 print:break-before-page print:border-0 print:pt-0"
          terms={terms}
        />
      ) : null}
    </article>
  );
}

/** The opening clauses. Shared with the terms renters accept when booking. */
export function AgreementClauses({ terms }: { terms: AgreementTerms }) {
  return (
    <>
      {terms.intro ? <p>{terms.intro}</p> : null}
      {terms.clauses.length ? (
        <ul className="list-disc space-y-1.5 pl-5">
          {terms.clauses.map((clause, index) => (
            <li key={index}>{clause}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function AgreementSectionBlock({ section }: { section: AgreementSection }) {
  if (section.kind === "fines") {
    return (
      <section className="space-y-2">
        <h3 className="font-semibold uppercase">{section.heading}</h3>
        <table className="w-full max-w-md text-sm">
          <tbody>
            {section.items.map((fine, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="py-1 pr-4">{fine.label}</td>
                <td className="py-1 text-right font-medium tabular-nums">
                  {formatPhp(fine.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  if (section.kind === "labeled") {
    return (
      <section className="space-y-2">
        <h3 className="font-semibold uppercase">{section.heading}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {section.items.map((item, index) => (
            <li key={index}>
              <span className="font-medium">{item.label}:</span> {item.text}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold uppercase">{section.heading}</h3>
      {section.intro ? <p>{section.intro}</p> : null}
      {section.items.length ? (
        <ul className="list-disc space-y-1 pl-5">
          {section.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.closing ? <p>{section.closing}</p> : null}
    </section>
  );
}

/** The sections between the clauses and signatures; empty ones are skipped. */
export function AgreementRules({ terms }: { terms: AgreementTerms }) {
  return (
    <>
      {terms.sections.map((section, index) =>
        isEmptySection(section) ? null : (
          <AgreementSectionBlock key={index} section={section} />
        ),
      )}
    </>
  );
}

/** The cancellation policy, then any added ones; empty ones are skipped. */
export function agreementPolicies(terms: AgreementTerms) {
  return [terms.cancellation, ...terms.policies].filter(
    (policy) => !isEmptyPolicy(policy),
  );
}

/**
 * Every policy, printed after the signatures. `policyClassName` styles each
 * one; `className` the block holding them.
 */
export function AgreementPolicies({
  terms,
  className,
  policyClassName,
}: {
  terms: AgreementTerms;
  className?: string;
  policyClassName?: string;
}) {
  return (
    <div className={className}>
      {agreementPolicies(terms).map((policy, index) => (
        <AgreementPolicyBlock key={index} className={policyClassName} policy={policy} />
      ))}
    </div>
  );
}

function AgreementPolicyBlock({
  policy,
  className,
}: {
  policy: AgreementPolicy;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {policy.title ? (
        <h2 className="text-base font-semibold uppercase">{policy.title}</h2>
      ) : null}
      {policy.intro ? <p>{policy.intro}</p> : null}
      {policy.sections.length ? (
        <ol className="space-y-2">
          {policy.sections.map((section, index) => (
            <li key={index}>
              <p className="font-semibold">
                {index + 1}. {section.heading}
              </p>
              <p>{section.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {policy.closing ? <p>{policy.closing}</p> : null}
    </section>
  );
}
