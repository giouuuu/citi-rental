import type { LucideIcon } from "lucide-react";
import { CalendarCheck, CarFront, KeyRound, MapPin } from "lucide-react";

export const landingSteps: Array<{
  icon: LucideIcon;
  number: string;
  title: string;
  description: string;
}> = [
  {
    icon: MapPin,
    number: "01",
    title: "Choose delivery",
    description:
      "Mactan–Cebu airport, your hotel, or your home, anywhere in Cebu province.",
  },
  {
    icon: CarFront,
    number: "02",
    title: "Pick a car",
    description:
      "Only cars free for your dates show up, each with its daily rate.",
  },
  {
    icon: CalendarCheck,
    number: "03",
    title: "Reserve online",
    description: "Book as a guest or with Google. We confirm pickup with you.",
  },
  {
    icon: KeyRound,
    number: "04",
    title: "Pick up and drive",
    description:
      "Collect a cleaned, inspected car. We're a message away if plans change.",
  },
];
