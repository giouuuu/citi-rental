import { normalizeHex } from "@/features/shared/lib/color";

/**
 * Colours a car gets on the fleet calendar until staff pick one. Far apart in
 * hue so neighbouring bars never read as the same car. Also the quick
 * swatches on the colour wheel.
 */
export const CAR_CALENDAR_PALETTE = [
  "#2563eb",
  "#e11d48",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#c026d3",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0f766e",
  "#92400e",
] as const;

/** A stable palette colour for a car nobody coloured, from its id. */
export function fallbackCarColor(vehicleId: string): string {
  let hash = 0;
  for (const char of vehicleId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CAR_CALENDAR_PALETTE[hash % CAR_CALENDAR_PALETTE.length];
}

/**
 * Every car's calendar colour. A picked colour is kept; the rest take palette
 * colours nobody picked, in list order, so cars only share a colour once the
 * palette runs out.
 */
export function assignCarColors(
  cars: { id: string; calendarColor?: string | null }[],
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const car of cars) {
    const picked = normalizeHex(car.calendarColor);
    if (picked) colors.set(car.id, picked);
  }
  const taken = new Set(colors.values());
  const free = CAR_CALENDAR_PALETTE.filter((color) => !taken.has(color));
  for (const car of cars) {
    if (colors.has(car.id)) continue;
    colors.set(car.id, free.shift() ?? fallbackCarColor(car.id));
  }
  return colors;
}
