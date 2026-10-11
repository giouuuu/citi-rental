"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Palette, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, inputSurfaceClassName } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  hexToHsv,
  hsvToHex,
  normalizeHex,
  readableTextColor,
  type Hsv,
} from "@/features/shared/lib/color";
import { cn } from "@/lib/utils";

const DEFAULT_HSV: Hsv = { h: 220, s: 0.8, v: 0.9 };

/**
 * A colour field: a hue/saturation wheel, a brightness slider, quick swatches
 * and a hex box, in a popover. Speaks lowercase `#rrggbb`; an empty value
 * means "no colour picked" and shows `emptyLabel`.
 */
export function ColorWheelPicker({
  value,
  onValueChange,
  swatches = [],
  emptyLabel = "No colour",
  clearLabel = "Clear colour",
  previewText,
  id,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  swatches?: readonly string[];
  emptyLabel?: string;
  clearLabel?: string;
  /** Sample text shown on the colour, e.g. a plate number. */
  previewText?: string;
  id?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const color = normalizeHex(value);
  const [open, setOpen] = useState(false);
  // Kept apart from `value` so hue survives dragging to the grey centre.
  const [hsv, setHsv] = useState<Hsv>(() => (color ? hexToHsv(color) : DEFAULT_HSV));
  const [draft, setDraft] = useState(color ?? "");
  const wheelRef = useRef<HTMLDivElement>(null);

  function commit(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    setDraft(hex);
    onValueChange(hex);
  }

  function commitHex(hex: string) {
    setHsv(hexToHsv(hex));
    setDraft(hex);
    onValueChange(hex);
  }

  function pick(event: PointerEvent<HTMLDivElement>) {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width / 2;
    const dx = event.clientX - rect.left - radius;
    const dy = event.clientY - rect.top - radius;
    // Red at the top, hue turning clockwise, like the conic gradient.
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    // A near-black brightness would hide every hue the wheel offers.
    commit({ h, s, v: hsv.v < 0.2 ? 1 : hsv.v });
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 15 : 5;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { h: (hsv.h - step + 360) % 360 },
      ArrowRight: { h: (hsv.h + step) % 360 },
      ArrowUp: { s: Math.min(1, hsv.s + step / 100) },
      ArrowDown: { s: Math.max(0, hsv.s - step / 100) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    commit({ ...hsv, ...move });
  }

  const handleAngle = (hsv.h * Math.PI) / 180;
  const shown = color ?? hsvToHex(hsv);
  const pureHue = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });

  return (
    <Popover
      onOpenChange={(next) => {
        if (next) {
          setHsv(color ? hexToHsv(color) : hsv);
          setDraft(color ?? "");
        }
        setOpen(next);
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- drives the shared invalid styling */}
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          className={cn(
            inputSurfaceClassName,
            "flex cursor-pointer items-center gap-2 text-left data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            !color && "text-muted-foreground",
          )}
          data-slot="color-wheel-trigger"
          disabled={disabled}
          id={id}
          type="button"
        >
          {color ? (
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-sm border border-black/10"
              style={{ backgroundColor: color }}
            />
          ) : (
            <Palette aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-mono text-sm">{color ?? emptyLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <div
          aria-label="Hue and saturation"
          aria-valuemax={360}
          aria-valuemin={0}
          aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`Hue ${Math.round(hsv.h)}°, saturation ${Math.round(hsv.s * 100)}%`}
          className="relative mx-auto size-48 cursor-crosshair touch-none rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onKeyDown={nudge}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
          }}
          ref={wheelRef}
          role="slider"
          style={{
            background:
              "radial-gradient(closest-side, #fff, transparent), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
          tabIndex={0}
        >
          {/* Brightness darkens the whole wheel, so it shows what you'd get. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-black"
            style={{ opacity: 1 - hsv.v }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_1px_3px_rgb(0_0_0/0.4)]"
            style={{
              backgroundColor: shown,
              left: `${50 + Math.sin(handleAngle) * hsv.s * 50}%`,
              top: `${50 - Math.cos(handleAngle) * hsv.s * 50}%`,
            }}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Brightness</p>
          <Slider
            aria-label="Brightness"
            className="h-3 rounded-full [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-transparent"
            max={100}
            min={0}
            onValueChange={([next]) => commit({ ...hsv, v: (next ?? 0) / 100 })}
            step={1}
            style={{ background: `linear-gradient(to right, #000, ${pureHue})` }}
            value={[Math.round(hsv.v * 100)]}
          />
        </div>

        {swatches.length ? (
          <div className="grid grid-cols-6 gap-2">
            {swatches.map((swatch) => (
              <button
                aria-label={swatch}
                aria-pressed={color === swatch}
                className={cn(
                  "aspect-square rounded-md border border-black/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  color === swatch && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                key={swatch}
                onClick={() => commitHex(swatch)}
                style={{ backgroundColor: swatch }}
                title={swatch}
                type="button"
              />
            ))}
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <div
            className="flex h-9 min-w-0 flex-1 items-center justify-center truncate rounded-md px-2 text-xs font-semibold"
            style={{ backgroundColor: shown, color: readableTextColor(shown) }}
          >
            {previewText || "Preview"}
          </div>
          <Input
            aria-label="Hex colour"
            className="w-28 font-mono"
            maxLength={7}
            onBlur={() => setDraft(color ?? "")}
            onChange={(event) => {
              setDraft(event.target.value);
              const hex = normalizeHex(event.target.value);
              if (hex && event.target.value.replace("#", "").length === 6) commitHex(hex);
            }}
            placeholder="#2563eb"
            spellCheck={false}
            value={draft}
          />
        </div>

        {color ? (
          <Button
            className="w-full"
            onClick={() => {
              onValueChange("");
              setDraft("");
              setOpen(false);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw />
            {clearLabel}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
