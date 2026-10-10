import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { NavigationProgress } from "@/components/navigation-progress";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  BUSINESS,
  OPEN_GRAPH_BASE,
  SEO_DESCRIPTION,
} from "@/features/seo/lib/business";
import { SiteTracker } from "@/features/site-analytics/components/site-tracker";
import { siteUrl } from "@/lib/site-url";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // Relative canonical/OG URLs resolve against the real domain in production.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Car Rental in Cebu | Zeke Car Rental & Services",
    template: "%s | Zeke Car Rental & Services",
  },
  description: SEO_DESCRIPTION,
  applicationName: BUSINESS.name,
  openGraph: OPEN_GRAPH_BASE,
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/brand/zeke-car-mark-web.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png" }],
  },
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode;
  modal: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NavigationProgress />
        <SiteTracker />
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-transform focus:translate-y-0 print:hidden"
        >
          Skip to main content
        </a>
        <TooltipProvider delayDuration={200}>
          {children}
          {modal}
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
