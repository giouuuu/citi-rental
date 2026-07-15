import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="relative z-30 border-b border-white/10">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="City Rentals home"
          className="flex items-center gap-3 text-white"
          href="/"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-teal-500 text-lg font-black text-brand-950">
            M
          </span>
          <span>
            <span className="block text-sm font-bold tracking-[0.16em] uppercase">
              City Rentals
            </span>
            <span className="block text-[10px] tracking-[0.2em] text-brand-100 uppercase">
              Car rental
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 text-sm font-medium text-brand-100 md:flex"
        >
          <a className="transition-colors hover:text-white" href="#fleet">
            Our cars
          </a>
          <a
            className="transition-colors hover:text-white"
            href="#how-it-works"
          >
            How it works
          </a>
          <a className="transition-colors hover:text-white" href="#support">
            Support
          </a>
        </nav>

        <Button
          asChild
          className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          variant="outline"
        >
          <Link href="/login">Staff login</Link>
        </Button>
      </div>
    </header>
  );
}
