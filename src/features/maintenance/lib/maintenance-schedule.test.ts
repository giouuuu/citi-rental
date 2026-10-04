import { describe, expect, it } from "vitest";

import { describeDue, describeInterval, nextDueParts } from "@/features/maintenance/lib/maintenance-schedule";

// Due status itself is tested against the view in
// supabase/tests/07_vehicle_maintenance.test.sql.

describe("describeInterval", () => {
  it("names one or both limits", () => {
    expect(describeInterval({ intervalKm: 10_000, intervalMonths: null })).toBe("Every 10,000 km");
    expect(describeInterval({ intervalKm: null, intervalMonths: 6 })).toBe("Every 6 months");
    expect(describeInterval({ intervalKm: null, intervalMonths: 1 })).toBe("Every month");
    expect(describeInterval({ intervalKm: null, intervalMonths: 12 })).toBe("Every year");
    expect(describeInterval({ intervalKm: 5_000, intervalMonths: 24 })).toBe(
      "Every 5,000 km or 2 years, whichever comes first",
    );
  });
});

describe("describeDue", () => {
  it("says the nearer limit in words", () => {
    expect(describeDue({ kmLeft: -1_200, daysLeft: 40 })).toBe("Overdue by 1,200 km");
    expect(describeDue({ kmLeft: 0, daysLeft: null })).toBe("Due now");
    expect(describeDue({ kmLeft: null, daysLeft: -3 })).toBe("Overdue by 3 days");
    expect(describeDue({ kmLeft: null, daysLeft: 0 })).toBe("Due today");
    expect(describeDue({ kmLeft: 800, daysLeft: 12 })).toBe("Due in 800 km or 12 days");
    expect(describeDue({ kmLeft: null, daysLeft: 1 })).toBe("Due in 1 day");
    expect(describeDue({ kmLeft: null, daysLeft: null })).toBe("Needs an odometer reading");
  });
});

describe("nextDueParts", () => {
  it("joins whichever due points the plan has", () => {
    const format = (key: string) => `[${key}]`;
    expect(nextDueParts({ nextDueKm: 40_150, nextDueOn: "2026-07-10" }, format)).toBe("40,150 km or [2026-07-10]");
    expect(nextDueParts({ nextDueKm: null, nextDueOn: "2026-07-10" }, format)).toBe("[2026-07-10]");
    expect(nextDueParts({ nextDueKm: null, nextDueOn: null }, format)).toBe("");
  });
});
