import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SeoLandingPage } from "@/features/seo/components/seo-landing-page";
import { OPEN_GRAPH_BASE } from "@/features/seo/lib/business";
import { cancellationAnswer } from "@/features/seo/lib/landing-faq";
import { loadSeoPageData } from "@/features/seo/lib/load-seo-page-data";

const PATH = "/car-rental-with-driver-cebu";
const TITLE = "Car Rental with Driver in Cebu";
const DESCRIPTION =
  "Rent a car with a local driver in Cebu for airport transfers, Oslob and Moalboal day trips, city tours, and group travel. Sedans and 7-seaters. Message us to book.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Zeke Car Rental & Services` },
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    ...OPEN_GRAPH_BASE,
    url: PATH,
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function WithDriverCarRentalPage() {
  const data = await loadSeoPageData(
    "Hi Zeke Car Rental & Services! I'd like to rent a car with a driver.",
  );
  // Online booking is self-drive only, so a driver is arranged over chat.
  const chatLinks = data.contactChannels.filter((channel) => channel.href);
  const rateLine = data.fromRate
    ? `Cars start at ${data.fromRate} a day, and the driver’s fee is added on top.`
    : "You pay the car’s daily rate, and the driver’s fee is added on top.";

  return (
    <SeoLandingPage
      contactChannels={data.contactChannels}
      cta={{ href: "#fleet", label: "See cars and rates" }}
      eyebrow="Car rental with driver"
      faq={[
        {
          question: "How much is a car rental with driver in Cebu?",
          answer: `${rateLine} We confirm the car rate and the driver’s fee with you before you pay.`,
        },
        {
          question: "How do I book a car with a driver?",
          answer:
            "Message us with your dates, pick-up point, and where you are going. We match a driver and confirm the total. Online booking on this site is for self-drive.",
        },
        {
          question: "Can the driver pick us up at Mactan-Cebu Airport?",
          answer:
            "Yes. Send us your flight details and your driver meets you at the airport, or at your hotel or address.",
        },
        {
          question: "Can we do a day trip to Oslob or Moalboal?",
          answer:
            "Yes. Tell us your route when you message us, and we confirm the plan and the total before your trip.",
        },
        {
          question: "Is the driver’s fee included in the car rate?",
          answer:
            "No. The car’s daily rate and the driver’s fee are separate, and we confirm both before you pay.",
        },
        {
          question: "Can I cancel?",
          answer: cancellationAnswer(data),
        },
      ]}
      fleet={{
        heading: "Choose your car",
        subtitle:
          "Every car can come with a driver. Message us with the car you like, or book it self-drive online.",
        vehicles: data.vehicles,
        reservationFee: data.reservationFee,
      }}
      heroExtra={
        chatLinks.length ? (
          <div className="mt-6">
            <p className="text-sm text-brand-100">
              Message us to book a driver:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {chatLinks.map((channel) => (
                <li key={channel.key}>
                  <Button
                    asChild
                    className="h-10 rounded-full border-white/30 bg-white/5 px-4 text-white hover:bg-white/15 hover:text-white"
                    variant="outline"
                  >
                    <a
                      href={channel.href!}
                      rel="noreferrer"
                      target={channel.key === "phone" ? undefined : "_blank"}
                    >
                      <MessageCircle aria-hidden="true" />
                      {channel.label}
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
      intro="Any car in our fleet, with a local driver who knows Cebu’s roads. For airport transfers, day trips south, city errands, and group travel, without driving in Cebu traffic yourself."
      path={PATH}
      sections={[
        {
          heading: "What it costs",
          body: [
            rateLine,
            "We confirm the car rate and the driver’s fee with you before you pay, so the total is settled before the trip.",
          ],
        },
        {
          heading: "Popular trips with a driver",
          body: ["Renters book a driver most often for:"],
          list: [
            "Airport transfers to and from Mactan-Cebu International Airport",
            "Day trips south to Oslob and Moalboal",
            "City tours and errands in Cebu City, Mandaue, and Lapu-Lapu",
            "Family trips and group outings in a 7-seater",
          ],
        },
        {
          heading: "Self-drive or with driver?",
          body: [
            "Self-drive suits renters with a valid license who want to set their own pace. Book online any time.",
            "A driver suits first-time visitors, groups, and long day trips where you would rather rest between stops than navigate.",
          ],
        },
        {
          heading: "Where we go",
          body: [
            "Anywhere on Cebu island. Rental cars stay on Cebu island, so trips to other islands by ferry are not included.",
          ],
        },
      ]}
      serviceType="Car rental with driver"
      steps={{
        heading: "How booking a driver works",
        items: [
          {
            title: "Pick a car",
            description:
              "Sedans for small groups, 7-seaters for families. Every car shows its daily rate.",
          },
          {
            title: "Message us your trip",
            description:
              "Send your dates, pick-up point, and where you are going.",
          },
          {
            title: "We confirm the total",
            description:
              "We match a driver and confirm the car rate plus the driver’s fee before you pay.",
          },
          {
            title: "Get picked up",
            description:
              "Your driver picks you up anywhere in Cebu province: the airport, your hotel, or your home.",
          },
        ],
      }}
      title={TITLE}
    />
  );
}
