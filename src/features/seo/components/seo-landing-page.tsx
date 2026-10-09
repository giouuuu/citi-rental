import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { ContactFab } from "@/components/landing/contact-fab";
import { FleetVehicleCard } from "@/components/landing/fleet-vehicle-card";
import { landingFontClassName } from "@/components/landing/landing-fonts";
import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import type { ContactChannel } from "@/features/settings/lib/contact-channels";
import { BUSINESS, jsonLdHtml } from "@/features/seo/lib/business";
import { faqJsonLd, type FaqItem } from "@/features/seo/lib/landing-faq";
import { SEO_PAGES, type SeoPagePath } from "@/features/seo/lib/seo-pages";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import { siteUrl } from "@/lib/site-url";

export type SeoSection = {
  heading: string;
  /** Paragraphs, then an optional list under them. */
  body: string[];
  list?: string[];
};

type SeoLandingPageProps = {
  path: SeoPagePath;
  eyebrow: string;
  title: string;
  intro: string;
  /** The hero's main action; contact links render beside it when given. */
  cta: { href: string; label: string };
  steps: { heading: string; items: { title: string; description: string }[] };
  sections: SeoSection[];
  faq: FaqItem[];
  fleet: {
    heading: string;
    subtitle: string;
    vehicles: PublicListedVehicle[];
    bookingQuery?: string;
    signedIn: boolean;
    reservationFee: number | null;
  };
  contactChannels: ContactChannel[];
  /** The schema.org `Service` this page offers, beyond name and area. */
  serviceType: string;
  /** Extra hero content under the actions, e.g. contact buttons. */
  heroExtra?: ReactNode;
};

/**
 * One page that answers one search ("car rental Mactan airport") end to end:
 * the answer up top, the live fleet, how it works, costs, and an FAQ — with
 * matching structured data so Google can show it as a rich result.
 */
export function SeoLandingPage({
  path,
  eyebrow,
  title,
  intro,
  cta,
  steps,
  sections,
  faq,
  fleet,
  contactChannels,
  serviceType,
  heroExtra,
}: SeoLandingPageProps) {
  const base = siteUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: title,
      serviceType,
      url: `${base}${path}`,
      provider: { "@id": `${base}/#business`, name: BUSINESS.name },
      areaServed: BUSINESS.areaServed.map((name) => ({
        "@type": "Place",
        name,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: BUSINESS.name, item: base },
        {
          "@type": "ListItem",
          position: 2,
          name: title,
          item: `${base}${path}`,
        },
      ],
    },
    faqJsonLd(faq),
  ];
  const related = SEO_PAGES.filter((page) => page.path !== path);

  return (
    <main
      className={`${landingFontClassName} min-h-screen bg-background font-landing`}
      id="main-content"
    >
      {jsonLd.map((data, index) => (
        <script
          dangerouslySetInnerHTML={jsonLdHtml(data)}
          key={index}
          type="application/ld+json"
        />
      ))}

      <div className="bg-brand-950 text-white">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-xs text-brand-100">
            <Link className="hover:text-white" href="/">
              {BUSINESS.name}
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span className="text-white">{eyebrow}</span>
          </nav>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-pretty text-brand-100 sm:text-lg">
            {intro}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="h-11 rounded-full bg-white px-6 text-brand-950 hover:bg-brand-50"
              size="lg"
            >
              <Link href={cta.href}>
                {cta.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {heroExtra}
        </div>
      </div>

      <section
        aria-labelledby="steps-title"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <h2
          className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance text-brand-950"
          id="steps-title"
        >
          {steps.heading}
        </h2>
        <ol className="mt-8 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.items.map((step, index) => (
            <li
              className="rounded-2xl bg-card p-6 ring-1 ring-border"
              key={step.title}
            >
              <span className="font-mono text-xs font-medium text-teal-700 tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-semibold text-brand-950">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-pretty text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {fleet.vehicles.length ? (
        <section
          aria-labelledby="fleet-title"
          className="border-t border-border bg-white py-16 sm:py-20"
          id="fleet"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2
              className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance text-brand-950"
              id="fleet-title"
            >
              {fleet.heading}
            </h2>
            <p className="mt-2 text-muted-foreground">{fleet.subtitle}</p>
            <ul className="mt-8 grid list-none gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {fleet.vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <FleetVehicleCard
                    bookingQuery={fleet.bookingQuery}
                    reservationFee={fleet.reservationFee}
                    signedIn={fleet.signedIn}
                    vehicle={vehicle}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-x-12 gap-y-12 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-2 lg:px-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-balance text-brand-950">
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  className="mt-3 leading-7 text-pretty text-muted-foreground"
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
              {section.list ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-7 text-muted-foreground marker:text-teal-600">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>

      <section
        aria-labelledby="faq-title"
        className="border-t border-border bg-white py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance text-brand-950"
            id="faq-title"
          >
            Questions
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {faq.map(({ question, answer }) => (
              <div key={question}>
                <dt className="font-semibold text-brand-950">{question}</dt>
                <dd className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
                  {answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 {BUSINESS.name} · DTI-registered, based in Cebu</p>
          <nav aria-label="More from Zeke">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link className="hover:text-brand-950" href="/">
                  Car rental in Cebu
                </Link>
              </li>
              {related.map((page) => (
                <li key={page.path}>
                  <Link className="hover:text-brand-950" href={page.path}>
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>

      <ContactFab channels={contactChannels} />
    </main>
  );
}
