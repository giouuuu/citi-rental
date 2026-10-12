/** Placeholders owners type when a field is required but unknown. */
const BLANK = /^(n\/?a|none|-+|\.+|tbd)?$/i;

/**
 * How a car is named in search titles and link previews: its public name,
 * led by the make when the owner filled one in ("Toyota Vios Automatic").
 */
export function vehicleSeoTitle(vehicle: { name: string; make: string }) {
  const name = vehicle.name.trim();
  const make = vehicle.make.trim();
  if (BLANK.test(make) || name.toLowerCase().includes(make.toLowerCase())) {
    return name;
  }
  return `${make} ${name}`;
}

/**
 * The car's own page title, told apart from look-alikes by colour and year:
 * "Vios Automatic (Red, 2027)". Two Vios Automatics would otherwise share one
 * title, and search engines skip pages that look like duplicates.
 */
export function vehicleListingTitle(vehicle: {
  name: string;
  make: string;
  color?: string | null;
  year?: number | null;
}) {
  const base = vehicleSeoTitle(vehicle);
  const color = vehicle.color?.trim();
  const details = [
    color && !BLANK.test(color) && !base.toLowerCase().includes(color.toLowerCase())
      ? color
      : null,
    vehicle.year && vehicle.year > 1900 ? String(vehicle.year) : null,
  ].filter(Boolean);
  return details.length ? `${base} (${details.join(", ")})` : base;
}
