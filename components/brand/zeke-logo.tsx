import { ZekeMark } from "@/components/brand/zeke-mark";
import { zekeWordmark } from "@/components/landing/landing-fonts";
import { cn } from "@/lib/utils";

const TAGLINE = [..."CAR RENTAL & SERVICES"];

/** Live lettering keeps the service line crisp at small responsive sizes. */
export function ZekeLogo({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      aria-label="Zeke Car Rental & Services"
      role="img"
      className={cn("inline-flex shrink-0 items-center gap-1.5 sm:gap-2", className)}
    >
      <ZekeMark className="size-9 sm:size-14" title="" />
      <span aria-hidden="true" className="inline-block">
        <span
          className={cn(
            zekeWordmark.className,
            "block text-[1.25rem] leading-none tracking-[0.04em] sm:text-[1.75rem]",
            tone === "dark" ? "text-white" : "text-brand-950",
          )}
        >
          ZEKE’S
        </span>
        {/* Spread letter by letter across the wordmark's width. */}
        <span
          className={cn(
            "mt-1 flex justify-between text-[0.5rem] leading-tight font-bold sm:mt-1.5 sm:text-[0.6875rem]",
            tone === "dark" ? "text-white/85" : "text-brand-700",
          )}
        >
          {TAGLINE.map((letter, index) =>
            letter === " " ? (
              <span className="w-[0.5em]" key={index} />
            ) : (
              <span key={index}>{letter}</span>
            ),
          )}
        </span>
      </span>
    </span>
  );
}
