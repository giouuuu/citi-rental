import type { Metadata } from "next";

import { formatPhp } from "@/features/shared/lib/money";
import { SeoLandingPage } from "@/features/seo/components/seo-landing-page";
import { OPEN_GRAPH_BASE } from "@/features/seo/lib/business";
import { cancellationAnswer } from "@/features/seo/lib/landing-faq";
import { loadSeoPageData } from "@/features/seo/lib/load-seo-page-data";

const PATH = "/car-rental-delivery-cebu";
const TITLE = "Car Rental with Delivery Anywhere in Cebu";
const DESCRIPTION =
  "Rent a car delivered to your hotel, home, office, or Mactan-Cebu Airport, anywhere in Cebu province. Clear daily rates and delivery fees up front. Book online.";

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

export default async function CarDeliveryPage() {
  const data = await loadSeoPageData(
    "Hi Zeke Car Rentals! I'd like a rental car delivered.",
  );
  const fee = data.reservationFee ? formatPhp(data.reservationFee) : null;
  const deliveryLine = data.deliveryFee
    ? `Delivery follows the rental agreement: ${data.deliveryFee}.`
    : null;

  return (
    <SeoLandingPage
      contactChannels={data.contactChannels}
      cta={{ href: "#fleet", label: "See cars and rates" }}
      eyebrow="Car delivery"
      faq={[
        {
          question: "Do you deliver rental cars anywhere in Cebu?",
          answer:
            "Yes, anywhere in Cebu province: your hotel, your home, your office, or Mactan-Cebu Airport. Enter the address when you book.",
        },
        {
          question: "How much is the delivery fee?",
          answer: deliveryLine
            ? `${deliveryLine} Staff confirm the exact amount with your booking.`
            : "Staff confirm the delivery fee with your booking.",
        },
        {
          question: "Can you deliver the car to my hotel?",
          answer:
            "Yes. Put your hotel’s name and address as the pick-up location, and staff confirm the handover time with you.",
        },
        {
          question: "Can you collect the car somewhere else?",
          answer:
            "Yes. The booking form has a separate return location, so we can collect the car from a different place than we delivered it.",
        },
        {
          question: "Can the car come with a driver?",
          answer:
            "Yes. Message us with your dates and where you are, and the driver brings the car to you.",
        },
        {
          question: "Can I cancel?",
          answer: cancellationAnswer(data),
        },
      ]}
      fleet={{
        heading: "Cars we can deliver",
        subtitle:
          "Every car can be delivered. Enter your address in the booking form.",
        vehicles: data.vehicles,
        signedIn: data.signedIn,
        reservationFee: data.reservationFee,
      }}
      intro="Skip the rental counter. Book online, tell us where you are, and we bring the car to you anywhere in Cebu province: your hotel, your home, your office, or Mactan-Cebu Airport."
      path={PATH}
      sections={[
        {
          heading: "Delivery fees",
          body: [
            ...(deliveryLine ? [deliveryLine] : []),
            "Staff confirm the exact amount with your booking, before you pay.",
            data.fromRate
              ? `Cars start at ${data.fromRate} a day, and the booking form shows your trip total before you submit.`
              : "The booking form shows your trip total before you submit.",
          ],
        },
        {
          heading: "Where we deliver",
          body: ["Anywhere in Cebu province, including:"],
          list: [
            "Cebu City",
            "Mandaue City and Consolacion",
            "Lapu-Lapu City and Mactan-Cebu International Airport",
            "Talisay City and the rest of Cebu province",
          ],
        },
        {
          heading: "Return where it suits you",
          body: [
            "Set a return location when you book: the same place, or somewhere else. We collect the car there.",
            "Return the car with the same fuel level it had at delivery.",
          ],
        },
        {
          heading: "What to have ready",
          body: ["Before the car arrives:"],
          list: [
            "A valid, unexpired driver’s license",
            "A selfie holding your license, uploaded when you book",
            "A photo of another government ID, uploaded when you book",
          ],
        },
      ]}
      serviceType="Car rental delivery"
      steps={{
        heading: "How delivery works",
        items: [
          {
            title: "Choose a car and dates",
            description:
              "See which cars are free for your trip and the total before you book.",
          },
          {
            title: "Enter your address",
            description:
              "Where we bring the car, and where we collect it, anywhere in Cebu province.",
          },
          {
            title: fee ? "Pay the reservation fee" : "Submit your booking",
            description: fee
              ? `${fee} holds the car. Staff confirm the delivery time.`
              : "Staff confirm the delivery time.",
          },
          {
            title: "We bring the car",
            description:
              "Check the car together, sign the rental agreement, and drive.",
          },
        ],
      }}
      title={TITLE}
    />
  );
}
