import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ZekeLogo } from "@/components/brand/zeke-logo";
import car from "@/components/landing/hero-scene/car.webp";
import {
  heroTitleFont,
  landingFontClassName,
} from "@/components/landing/landing-fonts";

/** Stagger for `.focus-in` / `.rise-in` intro elements. */
function enterDelay(ms: number) {
  return { "--focus-delay": `${ms}ms` } as CSSProperties;
}

/**
 * Auth pages wear the public site's look: the form on the left, the landing
 * hero's Cebu road (with the YOUR CEBU / JOURNEY lockup) on the right at lg+.
 * Phones keep the form first, under a sky-tinted band.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className={`${landingFontClassName} relative grid min-h-dvh bg-background font-landing lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:p-3`}
      id="main-content"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(to_bottom,#DCE9F5,transparent)] lg:hidden"
      />

      <section className="relative flex min-h-dvh flex-col px-4 sm:px-8 lg:min-h-0 lg:px-12 xl:px-16">
        <header className="flex h-20 items-center justify-between gap-4">
          <Link aria-label="Zeke Car Rentals home" href="/">
            <ZekeLogo />
          </Link>
          <Link
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-950/5 hover:text-brand-950"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span>
              Back<span className="max-sm:hidden"> to site</span>
            </span>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 lg:py-12">
          <div
            className="focus-in w-full max-w-[26rem]"
            style={enterDelay(80)}
          >
            {children}
          </div>
        </div>

        <p className="pb-6 text-center text-xs leading-5 text-muted-foreground lg:text-left">
          Zeke Car Rentals, Cebu. DTI-registered.
        </p>
      </section>

      <AuthScene />
    </main>
  );
}

/** The landing hero, flattened: road photo, title lockup, car on the near lane. */
function AuthScene() {
  return (
    <aside
      aria-hidden="true"
      className="sticky top-3 hidden self-start h-[calc(100dvh-1.5rem)] overflow-hidden rounded-3xl bg-[#DCE9F5] lg:block"
    >
      <Image
        alt=""
        className="object-cover object-[50%_62%]"
        fill
        priority
        sizes="55vw"
        src="/scene.jpeg"
      />
      {/* Haze over the sky so the lockup reads, and shade under the car. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(241_246_251/0.7),rgb(241_246_251/0.15)_38%,transparent_55%,rgb(7_17_31/0.25))]" />

      <div className="absolute inset-x-0 top-[9%] flex flex-col items-center text-center uppercase">
        <p
          className={`${heroTitleFont.className} focus-in pl-[0.24em] text-[clamp(1.5rem,2.6vw,2.5rem)] leading-none tracking-[0.24em] text-teal-600 drop-shadow-[0_2px_18px_rgb(241_246_251/0.55)]`}
          style={enterDelay(300)}
        >
          Your Cebu
        </p>
        <p
          className={`${heroTitleFont.className} focus-in -mt-[0.04em] bg-linear-to-b from-brand-800 from-25% to-[color-mix(in_oklab,var(--brand-500)_75%,#8fb2d4)] bg-clip-text pb-[0.04em] text-[clamp(6rem,13vw,12rem)] leading-[0.9] tracking-[0.01em] text-transparent drop-shadow-[0_2px_18px_rgb(241_246_251/0.55)]`}
          style={enterDelay(450)}
        >
          Journey
        </p>
      </div>

      {/* The car drives up the road from the horizon, as on the landing. */}
      <div className="absolute bottom-[calc(1.5rem+9%)] left-1/2 w-[min(40%,24rem,46dvh)] -translate-x-1/2">
        <div
          className="rise-in relative"
          style={
            {
              ...enterDelay(150),
              "--rise-from": "translateY(-22%) scale(0.55)",
            } as CSSProperties
          }
        >
          {/* Contact shadow on the asphalt, so the car stands on the road. */}
          <div className="absolute inset-x-[6%] -bottom-[3%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(7_17_31/0.55),transparent)] blur-[2px]" />
          <Image
            alt=""
            className="relative h-auto w-full drop-shadow-[0_18px_18px_rgb(7_17_31/0.35)]"
            priority
            sizes="24rem"
            src={car}
          />
        </div>
      </div>

      <p
        className="focus-in absolute inset-x-0 bottom-6 mx-auto w-fit rounded-full bg-white/80 px-5 py-1.5 text-sm font-medium text-brand-950 shadow-[0_10px_30px_-14px_rgb(7_17_31/0.45)] ring-1 ring-white/70 backdrop-blur-md"
        style={enterDelay(900)}
      >
        Clear daily rates. Delivered anywhere in Cebu.
      </p>
    </aside>
  );
}
