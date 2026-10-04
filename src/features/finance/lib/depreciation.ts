import { addDaysToKey, daysBetweenKeys } from "@/features/shared/lib/manila-time";
import { addMonthsToKey } from "@/features/finance/lib/finance-period";

export type DepreciationMethod = "straight_line" | "declining_balance" | "sum_of_years_digits";

export type FixedAsset = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  method: DepreciationMethod;
  disposedOn: string | null;
};

export type DepreciationMonth = {
  /** First day of the month, `YYYY-MM-01`. */
  month: string;
  amount: number;
  accumulated: number;
  bookValue: number;
};

const toCentavos = (pesos: number) => Math.round(pesos * 100);
const toPesos = (centavos: number) => Math.round(centavos) / 100;

function monthStartOf(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

/**
 * Cumulative depreciation (centavos, unrounded) after `elapsed` months.
 * Every method is expressed this way so monthly amounts are differences of
 * ROUNDED cumulatives: the centavos always sum to exactly cost - salvage.
 */
function cumulativeAfter(asset: FixedAsset, elapsed: number): number {
  const depreciable = toCentavos(asset.acquisitionCost) - toCentavos(asset.salvageValue);
  const life = asset.usefulLifeMonths;
  if (elapsed >= life) return depreciable;
  if (elapsed <= 0) return 0;

  if (asset.method === "straight_line") return (depreciable * elapsed) / life;

  // Accelerated methods are annual; months take an even 1/12 of their year.
  const years = life / 12;
  const yearEnds = annualCumulative(asset, years, depreciable);
  const fullYears = Math.floor(elapsed / 12);
  const intoYear = (elapsed % 12) / 12;
  return yearEnds[fullYears] + (yearEnds[fullYears + 1] - yearEnds[fullYears]) * intoYear;
}

/** Cumulative depreciation at the end of each year, index 0..years. */
function annualCumulative(asset: FixedAsset, years: number, depreciable: number): number[] {
  const cumulative = [0];

  if (asset.method === "sum_of_years_digits") {
    const digits = (years * (years + 1)) / 2;
    for (let year = 1; year <= years; year += 1) {
      cumulative.push(cumulative[year - 1] + (depreciable * (years - year + 1)) / digits);
    }
  } else {
    // Double-declining balance, switching to straight-line once that is
    // larger, and never depreciating below salvage.
    const salvage = toCentavos(asset.salvageValue);
    const rate = 2 / years;
    let bookValue = toCentavos(asset.acquisitionCost);
    for (let year = 1; year <= years; year += 1) {
      const remainingYears = years - year + 1;
      const declining = bookValue * rate;
      const straight = (bookValue - salvage) / remainingYears;
      const amount = Math.min(Math.max(declining, straight), bookValue - salvage);
      bookValue -= amount;
      cumulative.push(cumulative[year - 1] + amount);
    }
  }

  cumulative[years] = depreciable;
  return cumulative;
}

/**
 * Month-by-month schedule. Full-month convention: depreciation starts in the
 * month of acquisition and, for a disposed asset, ends with the month of
 * disposal. Confirm the convention with the accountant.
 */
export function depreciationSchedule(asset: FixedAsset): DepreciationMonth[] {
  const cost = toCentavos(asset.acquisitionCost);
  const firstMonth = monthStartOf(asset.acquisitionDate);
  const lastMonth = asset.disposedOn ? monthStartOf(asset.disposedOn) : null;
  const schedule: DepreciationMonth[] = [];

  let previous = 0;
  for (let index = 0; index < asset.usefulLifeMonths; index += 1) {
    const month = addMonthsToKey(firstMonth, index);
    if (lastMonth && month > lastMonth) break;
    const cumulative = Math.round(cumulativeAfter(asset, index + 1));
    schedule.push({
      month,
      amount: toPesos(cumulative - previous),
      accumulated: toPesos(cumulative),
      bookValue: toPesos(cost - cumulative),
    });
    previous = cumulative;
  }

  return schedule;
}

/**
 * Depreciation falling inside `from..to` (inclusive date keys). Whole months
 * count in full; a month the window only partly covers is prorated by day, so
 * custom windows stay honest.
 */
export function depreciationBetween(
  schedule: DepreciationMonth[],
  from: string,
  to: string,
): number {
  let total = 0;
  for (const entry of schedule) {
    const monthEnd = addDaysToKey(addMonthsToKey(entry.month, 1), -1);
    const start = entry.month > from ? entry.month : from;
    const end = monthEnd < to ? monthEnd : to;
    if (start > end) continue;
    const covered = daysBetweenKeys(start, end);
    const inMonth = daysBetweenKeys(entry.month, monthEnd);
    total += toCentavos(entry.amount) * (covered / inMonth);
  }
  return toPesos(total);
}

/** Accumulated depreciation and net book value at the end of `asOf`. */
export function bookValueAt(asset: FixedAsset, schedule: DepreciationMonth[], asOf: string) {
  const accumulated = depreciationBetween(schedule, monthStartOf(asset.acquisitionDate), asOf);
  return {
    accumulated,
    bookValue: toPesos(toCentavos(asset.acquisitionCost) - toCentavos(accumulated)),
  };
}
