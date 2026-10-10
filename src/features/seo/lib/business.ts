import { formatPhp } from "@/features/shared/lib/money";
import { siteUrl } from "@/lib/site-url";
import type { ContactChannelValues } from "@/features/settings/lib/contact-channels";

/**
 * What Google and AI answer engines should know about the business. Keep the
 * name, town and phone identical to the Google Business Profile — matching
 * NAP (name, address, phone) across listings is what local ranking checks.
 * Only the town is published: the street address is the owner's to share.
 */
export const BUSINESS = {
  name: "Zeke Car Rental & Services",
  alternateNames: [
    "Zeke Car Rentals",
    "Zeke's Car Rental & Tour Services",
    "Zeke Cebu Car Rental",
  ],
  legalName: "Zeke's Car Rental Services",
  email: "zekecebucarrental@gmail.com",
  locality: "Consolacion",
  region: "Cebu",
  postalCode: "6001",
  country: "PH",
  /** DTI business name registration no. Shown on the site when set. */
  dtiRegistrationNo: null as string | null,
  /** Mayor's / business permit no. Shown on the site when set. */
  businessPermitNo: null as string | null,
  /** Where renters pick up and drive — the places people search for. */
  areaServed: [
    "Cebu Province",
    "Cebu City",
    "Mactan-Cebu International Airport",
    "Lapu-Lapu City",
    "Mandaue City",
    "Consolacion",
    "Talisay City",
  ],
} as const;

export const SEO_DESCRIPTION =
  "Car rental in Cebu, self-drive or with driver, delivered anywhere in Cebu province: Mactan-Cebu Airport, your hotel, or your home. Clear daily rates. Book online.";

/**
 * Shared Open Graph fields. A page that sets `openGraph` replaces the
 * layout's object (shallow merge), so spread this rather than repeating it.
 */
export const OPEN_GRAPH_BASE = {
  type: "website",
  locale: "en_PH",
  siteName: BUSINESS.name,
} as const;

/** Sign-in, account, payment, and ops pages: never in search results. */
export const NOINDEX = { index: false, follow: false } as const;

/** Escapes `<` so a stored string can never close the script tag. */
export function jsonLdHtml(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

function e164(value: string | undefined) {
  const digits = value?.replace(/[^\d+]/g, "");
  return digits && digits.replace(/\D/g, "").length >= 10 ? digits : undefined;
}

/**
 * `AutoRental` (a LocalBusiness) plus `WebSite` for the homepage. Rates come
 * from the live fleet so the price range never drifts from the listing.
 */
export function businessJsonLd({
  contact,
  dailyRates,
}: {
  contact: Partial<ContactChannelValues>;
  dailyRates: number[];
}) {
  const base = siteUrl();
  const rates = dailyRates.filter((rate) => rate > 0);
  const telephone = e164(contact.phone) ?? e164(contact.whatsapp);
  const facebookPage = contact.messenger?.trim().replace(/^@/, "");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AutoRental",
        "@id": `${base}/#business`,
        name: BUSINESS.name,
        alternateName: BUSINESS.alternateNames,
        legalName: BUSINESS.legalName,
        description: SEO_DESCRIPTION,
        url: base,
        logo: `${base}/brand/zeke-icon-512.png`,
        image: `${base}/opengraph-image`,
        email: BUSINESS.email,
        ...(telephone ? { telephone } : {}),
        address: {
          "@type": "PostalAddress",
          addressLocality: BUSINESS.locality,
          addressRegion: BUSINESS.region,
          postalCode: BUSINESS.postalCode,
          addressCountry: BUSINESS.country,
        },
        areaServed: BUSINESS.areaServed.map((name) => ({
          "@type": "Place",
          name,
        })),
        currenciesAccepted: "PHP",
        ...(rates.length
          ? {
              priceRange: `${formatPhp(Math.min(...rates))}–${formatPhp(Math.max(...rates))} per day`,
            }
          : {}),
        ...(facebookPage && /^[A-Za-z0-9.]{5,50}$/.test(facebookPage)
          ? { sameAs: [`https://www.facebook.com/${facebookPage}`] }
          : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: BUSINESS.name,
        alternateName: BUSINESS.alternateNames,
        url: base,
        inLanguage: "en-PH",
        publisher: { "@id": `${base}/#business` },
      },
    ],
  };
}
