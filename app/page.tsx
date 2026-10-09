import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CarFront,
  ClipboardCheck,
  ExternalLink,
  Info,
  MapPin,
  PhoneCall,
  ReceiptText,
  Store,
  Tag,
} from "lucide-react";

import { ZekeLogo } from "@/components/brand/zeke-logo";
import { BookingSearch } from "@/components/landing/booking-search";
import { ContactFab } from "@/components/landing/contact-fab";
import { todayDateValue } from "@/components/landing/booking-search-schema";
import {
  driverCar,
  landingPhotoCredits,
} from "@/components/landing/hero-cars/hero-cars";
import {
  HeroFleetProvider,
  type HeroFleetCar,
} from "@/components/landing/hero-fleet";
import { HeroScene, HeroSceneControls } from "@/components/landing/hero-scene";
import { HERO_SCENE_INTRO_MS } from "@/components/landing/hero-scene-timing";
import {
  landingFontClassName,
  zekeWordmark,
} from "@/components/landing/landing-fonts";
import { LandingIntro } from "@/components/landing/landing-intro";
import { landingPolicies } from "@/components/landing/landing-policies";
import { landingSteps } from "@/components/landing/landing-steps";
import { SiteHeader } from "@/components/landing/site-header";
import { VehicleListing } from "@/components/landing/vehicle-listing";
import { Button } from "@/components/ui/button";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import {
  bookingContinuePath,
  bookingFormPath,
} from "@/features/booking/lib/booking-continue";
import {
  getPublicFreeCancellationHours,
  getPublicReservationFee,
} from "@/features/booking/services/public-booking-service";
import {
  businessJsonLd,
  jsonLdHtml,
  OPEN_GRAPH_BASE,
  SEO_DESCRIPTION,
} from "@/features/seo/lib/business";
import { faqJsonLd, landingFaq } from "@/features/seo/lib/landing-faq";
import { ReviewWall } from "@/features/reviews/components/review-wall";
import { listPublicReviews } from "@/features/reviews/services/list-public-reviews";
import { buildContactChannels } from "@/features/settings/lib/contact-channels";
import { getPublicContactChannels } from "@/features/settings/services/get-public-contact-channels";
import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";

/**
 * Phones: the scene fills the block above the search card and runs 4rem under
 * it, fading out there so the road never ends on a hard edge. md+: the whole
 * section (the host block goes static, so the section is the frame).
 */
const HERO_SCENE_FRAME =
  "inset-x-0 top-0 -bottom-16 [mask-image:linear-gradient(to_bottom,black_calc(100%-7rem),transparent)] md:bottom-0 md:[mask-image:none]";

const HERO_SUBTITLE = "Clear daily rates. Airport, hotel, or city pickup.";

/**
 * The search card comes in as the car starts up the road, not after it: on
 * phones it fills the lower half, which would otherwise sit empty.
 */
const SEARCH_CARD_DELAY_MS = 450;

/** Stagger for `.focus-in` intro elements. */
function focusDelay(ms: number) {
  return { "--focus-delay": `${ms}ms` } as CSSProperties;
}

export const metadata: Metadata = {
  title: {
    absolute:
      "Car Rental in Cebu – Self-Drive & With Driver | Zeke Car Rentals",
  },
  description: SEO_DESCRIPTION,
  // Trip searches (?start=…&pickup=…) are the same page; rank only one URL.
  alternates: { canonical: "/" },
  openGraph: {
    ...OPEN_GRAPH_BASE,
    url: "/",
    title: "Car Rental in Cebu – Self-Drive & With Driver",
    description: SEO_DESCRIPTION,
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
    type?: string;
  }>;
}) {
  const query = await searchParams;
  const today = todayDateValue();
  const start =
    query.start?.trim() && query.start.trim() >= today
      ? query.start.trim()
      : undefined;
  const end =
    query.end?.trim() && (!start || query.end.trim() >= start)
      ? query.end.trim()
      : undefined;
  const trip = {
    pickup: query.pickup?.trim() || undefined,
    start,
    end,
  };
  const [
    availableVehicles,
    contactValues,
    reservationFee,
    reviews,
    freeCancellationHours,
  ] = await Promise.all([
    listPublicAvailableVehicles({
      startDate: trip.start,
      endDate: trip.end,
    }),
    getPublicContactChannels(),
    getPublicReservationFee(),
    listPublicReviews(),
    getPublicFreeCancellationHours(),
  ]);
  // The Messenger setting is the Facebook page username (m.me/<page>).
  const facebookPage = contactValues.messenger?.trim().replace(/^@/, "");
  const facebookReviewsUrl =
    facebookPage && /^[A-Za-z0-9.]{5,50}$/.test(facebookPage)
      ? `https://www.facebook.com/${facebookPage}/reviews`
      : null;
  const recommendationCount = reviews.filter(
    (review) => review.source === "facebook" && review.body,
  ).length;
  const contactChannels = buildContactChannels(
    contactValues,
    "Hi Zeke Car Rentals! I'd like to ask about renting a car.",
  );
  const signedIn = await isBookingUserSignedIn();
  const bookingParams = new URLSearchParams();
  if (trip.pickup) bookingParams.set("pickup", trip.pickup);
  if (trip.start) bookingParams.set("start", trip.start);
  if (trip.end) bookingParams.set("end", trip.end);
  if (query.mode) bookingParams.set("mode", query.mode);
  const bookingQuery = bookingParams.toString() || undefined;
  const readyCount = availableVehicles.length;
  const dailyRates = availableVehicles.map((vehicle) => vehicle.daily_rate);
  const faq = landingFaq({ dailyRates, reservationFee, freeCancellationHours });
  // Hero lineup: available cars the owner gave a landing-page image.
  const heroFleet: HeroFleetCar[] = availableVehicles.flatMap((vehicle) =>
    vehicle.showcase_image_url
      ? [
          {
            id: vehicle.id,
            name: vehicle.name,
            color: vehicle.color,
            imageUrl: vehicle.showcase_image_url,
            dailyRate: vehicle.daily_rate,
            bookHref: (signedIn ? bookingFormPath : bookingContinuePath)(
              vehicle.id,
              trip,
            ),
            vehicle,
            trip,
            reservationFee,
          },
        ]
      : [],
  );

  return (
    <LandingIntro
      className={`${landingFontClassName} overflow-hidden bg-background font-landing`}
      data-surface="landing"
      id="main-content"
    >
      <script
        dangerouslySetInnerHTML={jsonLdHtml(
          businessJsonLd({ contact: contactValues, dailyRates }),
        )}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={jsonLdHtml(faqJsonLd(faq))}
        type="application/ld+json"
      />
      <HeroFleetProvider cars={heroFleet}>
        <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#DCE9F5]">
          {/* Scene host on phones, so the road ends where the card begins. */}
          <div className="relative flex flex-1 flex-col md:static">
            <HeroScene
              caption={
                <p
                  className="focus-in mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-white/75 px-4 py-1.5 text-center text-sm font-medium text-balance text-brand-950 shadow-[0_10px_30px_-14px_rgb(7_17_31/0.45)] ring-1 ring-white/70 backdrop-blur-md sm:px-5 sm:text-base"
                  style={focusDelay(1300)}
                >
                  {HERO_SUBTITLE}
                </p>
              }
              className={HERO_SCENE_FRAME}
              title={
                // Poster lockup in the ZEKE'S wordmark lettering, sized from
                // `--title-size` (globals.css `.hero-ridge-anchor`). It stands
                // in the far distance, so it takes the haze like the
                // mountains do: deep slate fading to their blue at the ridge.
                <p
                  className={`${zekeWordmark.className} flex flex-col items-center text-center uppercase drop-shadow-[0_2px_18px_rgb(241_246_251/0.55)]`}
                >
                  <span
                    className="focus-in pl-[0.24em] text-[calc(var(--title-size)*0.26)] leading-none tracking-[0.24em] text-teal-600"
                    style={focusDelay(800)}
                  >
                    Your Cebu
                  </span>
                  <span
                    className="focus-in mt-[calc(var(--title-size)*0.08)] bg-linear-to-b from-brand-800 from-25% to-[color-mix(in_oklab,var(--brand-500)_75%,#8fb2d4)] bg-clip-text text-(length:--title-size) leading-[0.86] tracking-[0.01em] text-transparent"
                    style={focusDelay(900)}
                  >
                    Journey
                  </span>
                </p>
              }
            />
            {/* Keeps the header legible over the treetops. Stops above the
                title, which sits in the scene under this. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,rgb(241_246_251/0.85),rgb(241_246_251/0.4)_55%,transparent)]"
            />
            <HeroSceneControls className={HERO_SCENE_FRAME} />
            <SiteHeader intro tone="light" />

            {/* The visible lockup lives in the scene, behind the mountains. */}
            <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
              <h1 className="sr-only">
                Car rental in Cebu: your Cebu journey with Zeke Car Rentals
              </h1>
              <p className="sr-only">{HERO_SUBTITLE}</p>

              {/* The road and car fill the space between headline and search. */}
              <div className="min-h-[calc(38svh+11rem)] flex-1 md:min-h-[calc(34svh+11rem)]" />
            </div>
          </div>

          <div
            className="focus-in relative z-20 mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-10"
            style={focusDelay(SEARCH_CARD_DELAY_MS)}
          >
            <BookingSearch
              initialEnd={trip.end}
              initialMode={query.mode}
              initialPickup={trip.pickup}
              initialStart={trip.start}
              key={[trip.pickup, trip.start, trip.end, query.mode].join("|")}
            />
          </div>
        </section>
      </HeroFleetProvider>

      <section aria-label="Why book with Zeke" className="bg-white pt-8 pb-6">
        <ul
          className="focus-in mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 sm:px-6 lg:grid-cols-4 lg:px-8"
          style={focusDelay(HERO_SCENE_INTRO_MS)}
        >
          <FeatureItem
            icon={<CarFront aria-hidden="true" />}
            title="Live availability"
            description={
              readyCount
                ? `${readyCount} ${readyCount === 1 ? "car" : "cars"} ready today`
                : "Updated as cars are booked"
            }
          />
          <FeatureItem
            icon={<ReceiptText aria-hidden="true" />}
            title="Clear daily rates"
            description="Trip total shown before you book"
          />
          <FeatureItem
            icon={<CalendarCheck aria-hidden="true" />}
            title="Book online"
            description="As a guest or with Google"
          />
          <FeatureItem
            icon={<MapPin aria-hidden="true" />}
            title="Pickup your way"
            description="Airport, hotel, or city"
          />
        </ul>
      </section>

      <VehicleListing
        bookingQuery={bookingQuery}
        initialCategory={query.type}
        key={query.type ?? "all"}
        reservationFee={reservationFee}
        signedIn={signedIn}
        trip={trip}
        vehicles={availableVehicles}
      />

      <section aria-labelledby="driver-title" className="px-4 sm:px-6 lg:px-8">
        <div className="reveal relative mx-auto grid max-w-7xl overflow-hidden rounded-3xl bg-[linear-gradient(115deg,var(--teal-700),var(--teal-500))] text-white md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-[20%] size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.18),transparent)]"
          />
          <div className="relative px-6 pt-10 sm:px-10 md:py-14 lg:px-14">
            <p className="text-sm font-medium text-teal-50/90">With driver</p>
            <h2
              className="mt-2 font-display text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
              id="driver-title"
            >
              Let a local driver take the wheel
            </h2>
            <p className="mt-3 max-w-md leading-7 text-teal-50/90">
              Any car, with a driver who knows Cebu’s roads — for airport runs,
              day trips, or a full team.
            </p>
            <Button
              asChild
              className="mt-7 h-11 rounded-full bg-white px-6 text-teal-800 hover:bg-teal-50"
              size="lg"
            >
              <Link href="/?mode=with-driver#find-a-car">
                Book with driver
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div
            aria-hidden="true"
            className="relative px-6 pt-6 pb-8 md:py-10 md:pr-0"
          >
            <Image
              alt=""
              className="h-auto w-full translate-x-[4%] drop-shadow-[0_24px_24px_rgb(4_47_44/0.45)]"
              sizes="(min-width: 768px) 560px, 90vw"
              src={driverCar.image}
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="how-it-works-title"
        className="py-20 sm:py-24"
        id="how-it-works"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="how-it-works-title"
            subtitle="Reserve online without calling first."
            title="How it works"
          />
          <ol className="reveal mt-10 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {landingSteps.map(({ icon: Icon, number, title, description }) => (
              <li
                className="flex flex-col rounded-2xl bg-card p-6 ring-1 ring-border"
                key={number}
              >
                <span className="font-mono text-xs font-medium text-teal-700 tabular-nums">
                  {number}
                </span>
                <h3 className="mt-3 font-semibold text-brand-950">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-pretty text-muted-foreground">
                  {description}
                </p>
                <span className="mt-6 flex size-12 items-center justify-center self-center rounded-2xl bg-teal-50 text-teal-700">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {reviews.length ? (
        <section
          aria-labelledby="reviews-title"
          className="border-t border-border py-20 sm:py-24"
          id="reviews"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="reviews-title"
              subtitle={
                recommendationCount > 1
                  ? `Recommended by ${recommendationCount} renters on Facebook.`
                  : "What renters say after their trip."
              }
              title="Loved by renters in Cebu"
            />
          </div>
          <ReviewWall reviews={reviews}>
            <Button asChild className="h-11 rounded-full px-6" size="lg">
              <a href="#find-a-car">
                Find your car
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            {facebookReviewsUrl ? (
              <Button
                asChild
                className="h-11 rounded-full px-5"
                size="lg"
                variant="ghost"
              >
                <a href={facebookReviewsUrl} rel="noreferrer" target="_blank">
                  See all on Facebook
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </ReviewWall>
        </section>
      ) : null}

      <section
        aria-labelledby="why-title"
        className="border-t border-border bg-white py-20 sm:py-24"
        id="why"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="why-title"
            subtitle="Renting a car in Cebu, kept simple."
            title="Why choose Zeke?"
          />
          <ul className="reveal mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <WhyItem
              description="Day rate and deposit set before you pay"
              icon={<Tag aria-hidden="true" />}
              title="Rate confirmed up front"
            />
            <WhyItem
              description="Every car checked before handover"
              icon={<ClipboardCheck aria-hidden="true" />}
              title="Cleaned and inspected"
            />
            <WhyItem
              description="Someone to call during your rental"
              icon={<PhoneCall aria-hidden="true" />}
              title="Roadside contact"
            />
            <WhyItem
              description="DTI-registered and based in Cebu"
              icon={<Store aria-hidden="true" />}
              title="Local and registered"
            />
          </ul>

          <div
            className="reveal mt-12 rounded-2xl bg-gold-50 p-5 ring-1 ring-gold-100 sm:p-6"
            id="rates"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-950">
              <Info aria-hidden="true" className="size-4 text-gold-700" />
              Before you go
            </h3>
            <ul className="mt-3 grid gap-2 text-sm text-brand-700 md:grid-cols-3 md:gap-6">
              {landingPolicies.beforeYouGo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="faq-title"
        className="border-t border-border py-20 sm:py-24"
        id="faq"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="faq-title"
            subtitle="What renters ask before booking a car in Cebu."
            title="Car rental in Cebu, answered"
          />
          {/* Always open: answers stay in the page for search engines. */}
          <dl className="reveal mx-auto mt-10 grid max-w-5xl gap-x-10 gap-y-8 md:grid-cols-2">
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

      <footer className="border-t border-border bg-background pt-14 pb-10 text-sm text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
            <div className="max-w-xs">
              <div className="flex items-center gap-3">
                <ZekeLogo />
              </div>
              <p className="mt-4 leading-6">
                Car rental in Cebu with clear daily rates and pickup at the
                airport, your hotel, or the city. DTI registered.
              </p>
            </div>
            <nav aria-label="Explore">
              <h2 className="font-semibold text-brand-950">Explore</h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    className="transition-colors hover:text-brand-950"
                    href="#fleet"
                  >
                    Available cars
                  </a>
                </li>
                <li>
                  <a
                    className="transition-colors hover:text-brand-950"
                    href="#how-it-works"
                  >
                    How it works
                  </a>
                </li>
                {reviews.length ? (
                  <li>
                    <a
                      className="transition-colors hover:text-brand-950"
                      href="#reviews"
                    >
                      Reviews
                    </a>
                  </li>
                ) : null}
                <li>
                  <a
                    className="transition-colors hover:text-brand-950"
                    href="#why"
                  >
                    Why Zeke
                  </a>
                </li>
                <li>
                  <a
                    className="transition-colors hover:text-brand-950"
                    href="#faq"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </nav>
            <nav aria-label="Account">
              <h2 className="font-semibold text-brand-950">Your booking</h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link
                    className="transition-colors hover:text-brand-950"
                    href="/account"
                  >
                    My account
                  </Link>
                </li>
                <li>
                  <a
                    className="transition-colors hover:text-brand-950"
                    href="#find-a-car"
                  >
                    Find a car
                  </a>
                </li>
                <li>
                  <Link
                    className="transition-colors hover:text-brand-950"
                    href="/login"
                  >
                    Staff portal
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs sm:flex-row sm:items-start sm:justify-between">
            <p>© 2026 Zeke Car Rentals</p>
            <details className="sm:text-right">
              <summary className="cursor-pointer transition-colors hover:text-brand-950">
                Photo credits
              </summary>
              <ul className="mt-3 space-y-1.5">
                {landingPhotoCredits.map(({ key, label, credit }) => (
                  <li key={key}>
                    <a
                      className="underline decoration-brand-950/20 underline-offset-2 hover:text-brand-950"
                      href={credit.source}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {label}
                    </a>{" "}
                    by {credit.author},{" "}
                    <a
                      className="underline decoration-brand-950/20 underline-offset-2 hover:text-brand-950"
                      href={credit.licenseUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {credit.license}
                    </a>
                    , via Wikimedia Commons. Edited; shared under the same
                    license.
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </footer>

      <ContactFab
        avoidSelector="#find-a-car"
        channels={contactChannels}
        className="focus-in"
        style={focusDelay(HERO_SCENE_INTRO_MS)}
      />
    </LandingIntro>
  );
}

function SectionHeading({
  id,
  title,
  subtitle,
}: {
  id: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="reveal mx-auto max-w-2xl text-center">
      <h2
        className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance text-brand-950 sm:text-4xl"
        id={id}
      >
        {title}
      </h2>
      <p className="mt-3 text-base text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-brand-950">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </li>
  );
}

function WhyItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 [&_svg]:size-5">
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-brand-950">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
    </li>
  );
}
