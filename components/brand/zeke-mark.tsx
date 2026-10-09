import Image from "next/image";

import { cn } from "@/lib/utils";

type ZekeMarkProps = {
  className?: string;
  /** Both surfaces retain the owner's signature yellow car. */
  variant?: "teal" | "navy";
  title?: string;
};

/** Compact car symbol, shared by customer login and contact controls. */
export function ZekeMark({
  className,
  title = "Zeke’s Car Rental & Tour Services",
}: ZekeMarkProps) {
  return (
    <span className={cn("relative block size-10 shrink-0", className)}>
      <Image
        alt={title}
        fill
        sizes="80px"
        src="/brand/zeke-car-mark-web.png"
        className="object-contain"
        unoptimized
      />
    </span>
  );
}
