import {
  Archivo_Black,
  Bricolage_Grotesque,
  Geist,
  League_Gothic,
} from "next/font/google";

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

/** Heavy wide lettering of the owner's ZEKE'S wordmark. Applied by class, so it renders on any page. */
export const zekeWordmark = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/**
 * Tall condensed poster face for the hero's YOUR CEBU / JOURNEY lockup: at a
 * given width its letters stand about 2.4x taller than the wordmark's.
 */
export const heroTitleFont = League_Gothic({
  subsets: ["latin"],
  display: "swap",
});

export const landingFontClassName = `${landingSans.variable} ${landingDisplay.variable}`;
