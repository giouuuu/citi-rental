import { formatPhp } from "@/features/shared/lib/money";

export type FaqItem = { question: string; answer: string };

/**
 * The questions renters type into Google, answered from live settings so the
 * page never promises a rate or policy the booking flow does not honour.
 */
export function landingFaq({
  dailyRates,
  reservationFee,
  freeCancellationHours,
}: {
  dailyRates: number[];
  reservationFee: number | null;
  freeCancellationHours: number | null;
}): FaqItem[] {
  const rates = dailyRates.filter((rate) => rate > 0);
  const fromRate = rates.length ? formatPhp(Math.min(...rates)) : null;

  return [
    {
      question: "How much is a car rental in Cebu?",
      answer: [
        fromRate
          ? `Daily rates start at ${fromRate}, and every car shows its own rate.`
          : "Every car shows its daily rate.",
        "Your trip total is shown before you book.",
        reservationFee
          ? `Online bookings pay a ${formatPhp(reservationFee)} reservation fee to hold the car.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      question: "Can I pick up my rental car at Mactan-Cebu Airport?",
      answer:
        "Yes. Choose airport, hotel, or city pickup when you search, and our staff confirm the handover with you before your trip.",
    },
    {
      question: "Do you offer self-drive and car rental with driver?",
      answer:
        "Both. Rent self-drive, or book any car with a local driver who knows Cebu’s roads — for airport runs, day trips, or group travel.",
    },
    {
      question: "What do I need to rent a car in Cebu?",
      answer:
        "A valid driver’s license at pickup. When you book, you upload a selfie holding your license and a photo of another government ID. Deposit and fuel rules are explained when your booking is confirmed.",
    },
    {
      question: "Can I cancel my booking?",
      answer:
        freeCancellationHours != null && reservationFee
          ? `Yes. Cancel at least ${freeCancellationHours} hours before pickup and the reservation fee is refunded.`
          : "Yes. Contact us before pickup to change or cancel your booking.",
    },
    {
      question: "Do I need to call before booking?",
      answer:
        "No. See which cars are free for your dates, then reserve online as a guest or with Google. Staff confirm your pickup after you book.",
    },
  ];
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
