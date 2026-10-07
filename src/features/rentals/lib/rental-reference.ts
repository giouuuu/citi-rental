import { manilaDateKey } from "@/features/shared/lib/manila-time";

/**
 * A reference for a counter booking, shaped like online ones
 * (`WEB-260301-A1B2C3`): `RNT-YYMMDD-XXXXXX`, Manila date. Staff can overwrite
 * it; the database still enforces uniqueness.
 */
export function suggestRentalReference(now = new Date(), random = crypto.randomUUID()): string {
  const yymmdd = manilaDateKey(now).slice(2).replaceAll("-", "");
  return `RNT-${yymmdd}-${random.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}
