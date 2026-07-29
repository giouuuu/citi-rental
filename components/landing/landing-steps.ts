import type { LucideIcon } from "lucide-react";
import { BadgeCheck, KeyRound, Search } from "lucide-react";

export const landingSteps: Array<{
  icon: LucideIcon;
  number: string;
  title: string;
  description: string;
}> = [
  {
    icon: Search,
    number: "01",
    title: "Choose your car",
    description: "Compare the right size, features, and rate for your trip.",
  },
  {
    icon: BadgeCheck,
    number: "02",
    title: "Confirm your booking",
    description: "Share your schedule and we will confirm availability quickly.",
  },
  {
    icon: KeyRound,
    number: "03",
    title: "Pick up and drive",
    description:
      "Collect a clean, inspected car at the agreed time — support stays available if plans change.",
  },
];
