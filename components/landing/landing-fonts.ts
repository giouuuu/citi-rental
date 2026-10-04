import { Bricolage_Grotesque, Geist } from "next/font/google";

/** Public-site faces. Scoped to the landing `<main>` so the ops app stays on Inter. */
export const landingSans = Geist({
  variable: "--font-landing-sans",
  subsets: ["latin"],
  display: "swap",
});

export const landingDisplay = Bricolage_Grotesque({
  variable: "--font-landing-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const landingFontClassName = `${landingSans.variable} ${landingDisplay.variable}`;
