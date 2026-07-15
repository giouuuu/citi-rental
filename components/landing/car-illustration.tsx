import { cn } from "@/lib/utils";

type CarIllustrationProps = {
  className?: string;
  variant?: "sedan" | "suv" | "van";
};

const roofPaths = {
  sedan: "M218 166C244 115 284 92 342 92H450C486 92 523 113 559 166Z",
  suv: "M205 166L245 94C254 78 270 70 289 70H475C493 70 509 81 518 96L560 166Z",
  van: "M182 166V82C182 64 197 50 215 50H472C500 50 522 72 522 100V166Z",
};

export function CarIllustration({
  className,
  variant = "sedan",
}: CarIllustrationProps) {
  const isVan = variant === "van";

  return (
    <svg
      aria-hidden="true"
      className={cn("h-auto w-full", className)}
      viewBox="0 0 720 320"
    >
      <ellipse
        cx="360"
        cy="273"
        rx="282"
        ry="20"
        fill="var(--brand-950)"
        opacity="0.16"
      />
      <path d={roofPaths[variant]} fill="currentColor" />
      <path
        d="M159 166H573C603 166 628 185 637 213L647 244H91L105 202C112 180 134 166 159 166Z"
        fill="currentColor"
      />
      <path
        d={
          isVan
            ? "M201 73H315V157H201ZM329 73H467C487 73 503 89 503 109V157H329Z"
            : "M259 108H339V157H234ZM354 108H445C472 108 497 126 519 157H354Z"
        }
        fill="var(--brand-950)"
        opacity="0.82"
      />
      <path
        d="M113 202C222 183 478 183 626 204"
        fill="none"
        stroke="var(--teal-100)"
        strokeLinecap="round"
        strokeWidth="8"
        opacity="0.64"
      />
      <path
        d="M89 244H651V256C651 266 643 274 633 274H107C97 274 89 266 89 256Z"
        fill="var(--brand-950)"
        opacity="0.82"
      />
      <rect
        x="108"
        y="204"
        width="51"
        height="18"
        rx="9"
        fill="var(--gold-500)"
      />
      <rect
        x="580"
        y="204"
        width="43"
        height="18"
        rx="9"
        fill="var(--teal-100)"
      />
      <g>
        <circle cx="207" cy="251" r="47" fill="var(--brand-950)" />
        <circle cx="207" cy="251" r="24" fill="var(--brand-500)" />
        <circle cx="207" cy="251" r="8" fill="var(--brand-100)" />
      </g>
      <g>
        <circle cx="535" cy="251" r="47" fill="var(--brand-950)" />
        <circle cx="535" cy="251" r="24" fill="var(--brand-500)" />
        <circle cx="535" cy="251" r="8" fill="var(--brand-100)" />
      </g>
      <path
        d="M365 174V224M351 188H379"
        fill="none"
        stroke="var(--brand-950)"
        strokeLinecap="round"
        strokeWidth="5"
        opacity="0.45"
      />
    </svg>
  );
}
