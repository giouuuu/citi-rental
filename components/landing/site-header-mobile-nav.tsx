"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu } from "lucide-react";

import { ZekeLogo } from "@/components/brand/zeke-logo";
import { landingFontClassName } from "@/components/landing/landing-fonts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The header's page links on phones, where the inline nav is hidden: a menu
 * button that opens them in a side sheet, with the Find a car action.
 */
export function SiteHeaderMobileNav({
  links,
  tone = "dark",
}: {
  links: { href: string; label: string }[];
  tone?: "dark" | "light";
}) {
  // Controlled: the links close it themselves. `SheetClose` would skip closing
  // when `SectionScroll` has already claimed the click for an in-page glide.
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button
          aria-label="Open menu"
          className={cn(
            "size-10 md:hidden",
            tone === "dark" &&
              "border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white",
          )}
          size="icon"
          type="button"
          variant="outline"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        // Portaled out of the landing <main>, so it brings the font variables.
        className={cn(landingFontClassName, "gap-0 font-landing")}
        // Focus returning to the trigger would scroll the page back up to the
        // header, undoing the jump to the section just picked.
        onCloseAutoFocus={(event) => event.preventDefault()}
        side="right"
      >
        <SheetHeader className="border-b px-5 py-4">
          <ZekeLogo />
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Pages on the Zeke Car Rental & Services site
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile navigation" className="px-3 py-4">
          <ul className="space-y-1">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  className="flex items-center rounded-xl px-3 py-3 text-base font-medium text-brand-950 transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  href={href}
                  onClick={close}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <SheetFooter className="border-t px-5 py-4">
          <Button asChild className="h-11 w-full" size="lg">
            <Link href="/#find-a-car" onClick={close}>
              Find a car
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
