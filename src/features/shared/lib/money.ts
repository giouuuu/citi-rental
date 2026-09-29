const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const compactPhpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatPhp(amount: number) {
  return phpFormatter.format(amount);
}

/** Short axis labels: ₱12.5K, ₱1.2M. */
export function formatPhpCompact(amount: number) {
  return compactPhpFormatter.format(amount);
}

/** Rounds to centavos; Postgres numeric arrives as a string or number. */
export function toMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
