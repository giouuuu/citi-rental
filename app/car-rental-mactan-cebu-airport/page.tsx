import type { Metadata } from "next";

import { formatPhp } from "@/features/shared/lib/money";
import { SeoLandingPage } from "@/features/seo/components/seo-landing-page";
import { OPEN_GRAPH_BASE } from "@/features/seo/lib/business";
import { cancellationAnswer } from "@/features/seo/lib/landing-faq";
import { loadSeoPageData } from "@/features/seo/lib/load-seo-page-data";

const PATH = "/car-rental-mactan-cebu-airport";
const AIRPORT = "Mactan-Cebu International Airport";
const TITLE = "Car Rental at Mactan-Cebu Airport (MCIA)";
const DESCRIPTION =
  "Rent a car at Mactan-Cebu International Airport. We deliver the car to the airport when you land, or anywhere else in Cebu province. Self-drive or with driver.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Zeke Car Rentals` },
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    ...OPEN_GRAPH_BASE,
    url: PATH,
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function AirportCarRentalPage() {
  const data = await loadSeoPageData(
    "Hi Zeke Car Rentals! I'd like to rent a car from Mactan-Cebu Airport.",
  );
  const fee = data.reservationFee ? formatPhp(data.reservationFee) : null;
  // Cards open the booking form with the airport already filled in.
  const bookingQuery = new URLSearchParams({ pickup: AIRPORT }).toString();

  return (
    <SeoLandingPage
      contactChannels={data.contactChannels}
      cta={{ href: "#fleet", label: "See cars at the airport" }}
      eyebrow="Airport car rental"
      faq={[
        {
          question: "Can I rent a car at Mactan-Cebu Airport?",
          answer:
            "Yes. Book online with the airport as your delivery point, and our staff confirm the handover with you before you land.",
        },
        {
          question: "Do you only deliver to the airport?",
          answer:
            "No. We deliver anywhere in Cebu province: the airport, your hotel, your home, or your office. Change the pick-up location in the booking form to any address.",
        },
        {
          question: "How much is an airport car rental in Cebu?",
          answer: [
            data.fromRate
              ? `Daily rates start at ${data.fromRate}, and each car shows its own rate and your trip total before you book.`
              : "Each car shows its daily rate and your trip total before you book.",
            data.deliveryFee
              ? `Delivery is charged per the rental agreement: ${data.deliveryFee}.`
              : null,
          ]
            .filter(Boolean)
            .join(" "),
        },
        {
          question: "Can I return the car at the airport?",
          answer:
            "Yes. Set the airport as your return location when you book, and we collect the car there before your flight.",
        },
        {
          question: "Can I get a car with a driver from the airport?",
          answer:
            "Yes. Message us with your flight and where you are staying, and a local driver meets you at the airport.",
        },
        {
          question: "What do I need to rent a car at the airport?",
          answer:
            "A valid, unexpired driver’s license at pickup. When you book, you upload a selfie holding your license and a photo of another government ID.",
        },
        {
          question: "Can I cancel my airport booking?",
          answer: cancellationAnswer(data),
        },
      ]}
      fleet={{
        heading: "Cars available for airport delivery",
        subtitle:
          "The airport is filled in as your delivery point. Change it to any address in Cebu province if you prefer.",
        vehicles: data.vehicles,
        bookingQuery,
        signedIn: data.signedIn,
        reservationFee: data.reservationFee,
      }}
      intro="We deliver your rental car to Mactan-Cebu International Airport, so you can drive straight to your hotel, the beach, or the south of the island. The airport is one stop: we deliver anywhere in Cebu province."
      path={PATH}
      sections={[
        {
          heading: "What airport car rental costs",
          body: [
            data.fromRate
              ? `Daily rates start at ${data.fromRate}. Every car lists its rate, and the booking form shows your trip total before you submit.`
              : "Every car lists its daily rate, and the booking form shows your trip total before you submit.",
            ...(data.deliveryFee
              ? [
                  `We deliver anywhere in Cebu province. The fee follows the rental agreement: ${data.deliveryFee}. Staff confirm the exact amount with your booking.`,
                ]
              : []),
            ...(fee
              ? [`A ${fee} reservation fee holds the car until pickup.`]
              : []),
          ],
        },
        {
          heading: "What to bring",
          body: ["Have these ready when you book and at the handover:"],
          list: [
            "A valid, unexpired driver’s license",
            "A selfie holding your license, uploaded when you book",
            "A photo of another government ID, uploaded when you book",
            "Your flight number, added in the booking notes",
          ],
        },
        {
          heading: "Where you can drive",
          body: [
            "Anywhere on Cebu island: Cebu City, Mandaue, Lapu-Lapu, south to Oslob and Moalboal, or north along the coast.",
            "Cars stay on Cebu island. Taking a rental car on a ferry to another island is not allowed under the rental agreement.",
          ],
        },
        {
          heading: "Returning before your flight",
          body: [
            "Set the airport as your return location when you book. We collect the car at the airport, so you go straight to check-in.",
            "Return the car with the same fuel level you picked it up with.",
          ],
        },
      ]}
      serviceType="Airport car rental"
      steps={{
        heading: "How airport delivery works",
        items: [
          {
            title: "Choose a car and dates",
            description:
              "See which cars are free for your trip and the total before you book.",
          },
          {
            title: "Keep the airport as delivery point",
            description:
              "It is filled in for you. Add your flight number in the notes so we can time the handover.",
          },
          {
            title: fee ? "Pay the reservation fee" : "Submit your booking",
            description: fee
              ? `${fee} holds the car. Staff confirm your handover time and spot.`
              : "Staff confirm your handover time and spot.",
          },
          {
            title: "Meet us and drive",
            description:
              "Check the car together, sign the rental agreement, and start your trip.",
          },
        ],
      }}
      title={TITLE}
    />
  );
}
