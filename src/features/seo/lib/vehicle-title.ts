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
