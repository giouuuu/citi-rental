/**
 * Small colour maths for pickers and coloured labels. Colours are stored and
 * passed around as lowercase `#rrggbb`; the wheel works in HSV (hue 0–360,
 * saturation and value 0–1).
 */

export type Hsv = { h: number; s: number; v: number };

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`; anything else → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw))
    return `#${[...raw].map((digit) => digit + digit).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = v - chroma;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#ffffff";

/** White or near-black, whichever reads better on `background`. */
export function readableTextColor(background: string): string {
  const bg = luminance(background);
  const onLight = (bg + 0.05) / (luminance(DARK_TEXT) + 0.05);
  const onDark = (luminance(LIGHT_TEXT) + 0.05) / (bg + 0.05);
  return onLight > onDark ? DARK_TEXT : LIGHT_TEXT;
}
