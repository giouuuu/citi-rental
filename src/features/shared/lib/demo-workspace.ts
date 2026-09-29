import { manilaDateKey, manilaDayStart } from "@/features/shared/lib/manila-time";

/**
 * Sample data for demo mode (no Supabase environment). One deterministic
 * workspace — fleet, customers, rentals, and a payments ledger — so the
 * dashboard, analytics, and customer history all tell the same story and
 * their totals agree. Rentals are laid out relative to today's Manila date so
 * the dashboard always has returns due, an overdue car, and pickups ahead.
 *
 * Never used when Supabase is configured.
 */

export type DemoVehicle = {
  id: string;
  plateNumber: string;
  name: string;
  category: string;
  dailyRate: number;
  status: "available" | "maintenance" | "inactive";
  createdAt: string;
};

export type DemoCustomer = {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  driversLicenseNumber: string;
  isBlocked: boolean;
  createdAt: string;
};

export type DemoRentalStatus =
  | "draft"
  | "reserved"
  | "active"
  | "overdue"
  | "completed"
  | "cancelled";

export type DemoRental = {
  id: string;
  referenceNumber: string;
  customerId: string;
  vehicleId: string;
  status: DemoRentalStatus;
  bookingSource: "ops" | "public_web";
  createdAt: string;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string | null;
  quotedTotal: number;
  pickupLocation: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

export type DemoPayment = {
  rentalId: string;
  paymentType: "deposit" | "balance" | "penalty" | "refund" | "adjustment";
  amount: number;
  confirmedAt: string;
};

export type DemoWorkspace = {
  vehicles: DemoVehicle[];
  customers: DemoCustomer[];
  rentals: DemoRental[];
  payments: DemoPayment[];
};

export const DEMO_VEHICLES: DemoVehicle[] = [
  { id: "demo-vehicle", plateNumber: "NCR 1842", name: "Toyota Vios 01", category: "Sedan", dailyRate: 2000, status: "available", createdAt: "2025-06-01T00:00:00Z" },
  { id: "demo-vehicle-2", plateNumber: "GAB 2291", name: "Honda City", category: "Sedan", dailyRate: 2200, status: "available", createdAt: "2025-06-01T00:00:00Z" },
  { id: "demo-vehicle-3", plateNumber: "VAN 5041", name: "Nissan Urvan", category: "Van", dailyRate: 4500, status: "available", createdAt: "2025-06-01T00:00:00Z" },
  { id: "demo-vehicle-4", plateNumber: "SUV 7718", name: "Toyota Fortuner", category: "SUV", dailyRate: 4000, status: "available", createdAt: "2025-08-15T00:00:00Z" },
  { id: "demo-vehicle-5", plateNumber: "HAT 3306", name: "Mitsubishi Mirage", category: "Hatchback", dailyRate: 1600, status: "available", createdAt: "2025-08-15T00:00:00Z" },
  { id: "demo-vehicle-6", plateNumber: "MPV 6120", name: "Toyota Innova", category: "MPV", dailyRate: 3200, status: "available", createdAt: "2025-11-01T00:00:00Z" },
  { id: "demo-vehicle-7", plateNumber: "SUV 9054", name: "Ford Everest", category: "SUV", dailyRate: 4200, status: "maintenance", createdAt: "2026-01-10T00:00:00Z" },
  { id: "demo-vehicle-8", plateNumber: "SED 4417", name: "Toyota Vios 02", category: "Sedan", dailyRate: 1900, status: "available", createdAt: "2026-03-01T00:00:00Z" },
];

const CUSTOMER_NAMES = [
  "Mika Santos", "Paolo Cruz", "Jessa Lim", "Carlo Reyes", "Andrea Tan", "Miguel Bautista",
  "Bea Villanueva", "Joshua Garcia", "Katrina Uy", "Rafael Mendoza", "Sofia Aquino",
  "Nico Dela Cruz", "Louise Ramos", "Enzo Navarro", "Trisha Gomez", "Marco Flores",
];

export const DEMO_CUSTOMERS: DemoCustomer[] = CUSTOMER_NAMES.map((fullName, index) => ({
  id: index === 0 ? "demo-customer" : `demo-customer-${index + 1}`,
  fullName,
  phoneNumber: `+63 917 555 ${String(184 + index * 37).padStart(4, "0")}`,
  email: index % 3 === 2 ? null : `${fullName.toLowerCase().replaceAll(" ", ".")}@example.ph`,
  driversLicenseNumber: `N0${index + 1}-23-${String(456789 + index * 1013).slice(0, 6)}`,
  // One blocked renter so the customer panels have something to flag.
  isBlocked: index === 13,
  createdAt: new Date(Date.UTC(2025, 5 + (index % 8), 1 + index)).toISOString(),
}));

const PICKUP_LOCATIONS = ["Mactan-Cebu Airport", "IT Park", "Ayala Center Cebu", "SM Seaside", "Hotel delivery"];

/** Small deterministic PRNG (mulberry32) so demo numbers are stable. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const NEW_CUSTOMER_DAYS = 42;
const NEW_CUSTOMER_IDS = new Set(DEMO_CUSTOMERS.slice(-3).map((customer) => customer.id));

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 420;

/** Builds the demo workspace anchored to the Manila day containing `now`. */
export function buildDemoWorkspace(now: Date = new Date()): DemoWorkspace {
  const todayKey = manilaDateKey(now);
  const todayStart = manilaDayStart(todayKey).getTime();
  const random = seeded(20260929);
  const rentals: DemoRental[] = [];
  const payments: DemoPayment[] = [];
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  // Regulars rent far more often than one-off renters.
  const weightedCustomers = DEMO_CUSTOMERS.flatMap((customer, index) =>
    Array.from({ length: index < 4 ? 4 : index < 9 ? 2 : 1 }, () => customer),
  );
  let sequence = 0;

  function add(
    vehicle: DemoVehicle,
    startMs: number,
    days: number,
    status: DemoRentalStatus,
    options: { customerId?: string; lateHours?: number; source?: "ops" | "public_web" } = {},
  ) {
    sequence += 1;
    const startAt = new Date(startMs);
    const expected = new Date(startMs + days * DAY_MS);
    const leadDays = 1 + Math.floor(random() * 10);
    const createdAt = new Date(
      Math.min(startMs - leadDays * DAY_MS, now.getTime() - (1 + Math.floor(random() * 96)) * HOUR_MS),
    );
    // The last few customers are new this season: they only appear in the
    // past six weeks, so the new-vs-returning split has something to show.
    const recent = startMs > now.getTime() - NEW_CUSTOMER_DAYS * DAY_MS;
    const customerId =
      options.customerId ??
      pick(
        weightedCustomers.filter(
          (customer) => !customer.isBlocked && (recent || !NEW_CUSTOMER_IDS.has(customer.id)),
        ),
      ).id;
    const quotedTotal = vehicle.dailyRate * days;
    const source = options.source ?? (random() < 0.55 ? "public_web" : "ops");
    const id = `demo-rental-${String(sequence).padStart(3, "0")}`;
    const reference = `${source === "public_web" ? "WEB" : "RNT"}-${manilaDateKey(startAt).replaceAll("-", "").slice(2)}-${String(sequence).padStart(3, "0")}`;
    const actualReturnAt =
      status === "completed"
        ? new Date(expected.getTime() + (options.lateHours ?? 0) * HOUR_MS).toISOString()
        : null;

    rentals.push({
      id,
      referenceNumber: reference,
      customerId,
      vehicleId: vehicle.id,
      status,
      bookingSource: source,
      createdAt: createdAt.toISOString(),
      startAt: startAt.toISOString(),
      expectedReturnAt: expected.toISOString(),
      actualReturnAt,
      quotedTotal,
      pickupLocation: pick(PICKUP_LOCATIONS),
      cancelledAt:
        status === "cancelled"
          ? new Date(Math.min(startMs - DAY_MS, now.getTime() - HOUR_MS)).toISOString()
          : null,
      cancellationReason:
        status === "cancelled"
          ? pick(["customer_request", "payment_not_received", "no_show", "customer_request"])
          : null,
    });

    if (status === "draft") return;
    const deposit = Math.round(quotedTotal * 0.3);
    if (status !== "cancelled" || random() < 0.4) {
      payments.push({
        rentalId: id,
        paymentType: "deposit",
        amount: deposit,
        confirmedAt: new Date(createdAt.getTime() + 6 * HOUR_MS).toISOString(),
      });
    }
    if (status === "cancelled" && payments.at(-1)?.rentalId === id) {
      payments.push({
        rentalId: id,
        paymentType: "refund",
        amount: deposit,
        confirmedAt: new Date(createdAt.getTime() + 2 * DAY_MS).toISOString(),
      });
    }
    if (status === "active" || status === "overdue") {
      payments.push({ rentalId: id, paymentType: "balance", amount: quotedTotal - deposit, confirmedAt: startAt.toISOString() });
    }
    if (status === "completed") {
      const returned = actualReturnAt!;
      // A few recent renters still owe part of the balance — they drive receivables.
      const recentReturn = new Date(returned).getTime() > now.getTime() - 45 * DAY_MS;
      const shortfall = recentReturn && random() < 0.2 ? Math.round((quotedTotal - deposit) * 0.4) : 0;
      payments.push({ rentalId: id, paymentType: "balance", amount: quotedTotal - deposit - shortfall, confirmedAt: startAt.toISOString() });
      if (random() < 0.15) {
        const penalty = 500 + Math.round(random() * 6) * 250;
        payments.push({ rentalId: id, paymentType: "penalty", amount: penalty, confirmedAt: returned });
        if (!recentReturn || random() < 0.6) {
          payments.push({ rentalId: id, paymentType: "balance", amount: penalty, confirmedAt: new Date(new Date(returned).getTime() + DAY_MS).toISOString() });
        }
      }
    }
  }

  // History: each car rents back to back with gaps, busier in the Dec–May
  // peak. It stops five days out so it never overlaps today's rentals below;
  // the last car sits idle for the past five weeks.
  DEMO_VEHICLES.forEach((vehicle, vehicleIndex) => {
    const since = Math.max(new Date(vehicle.createdAt).getTime(), todayStart - HISTORY_DAYS * DAY_MS);
    const stopAt = vehicleIndex === 7 ? todayStart - 36 * DAY_MS : todayStart - 5 * DAY_MS;
    let cursor = since + Math.floor(random() * 6) * DAY_MS + 10 * HOUR_MS;
    while (cursor < stopAt) {
      const month = new Date(cursor).getUTCMonth();
      const peak = month === 11 || month <= 4;
      const days = 1 + Math.floor(random() * (peak ? 5 : 4));
      if (cursor + days * DAY_MS >= stopAt) break;
      const roll = random();
      const status: DemoRentalStatus = roll < 0.07 ? "cancelled" : "completed";
      const lateHours = status === "completed" && random() < 0.1 ? 2 + Math.floor(random() * 20) : 0;
      add(vehicle, cursor, days, status, { lateHours });
      const gap = Math.floor(random() * (peak ? 4 : 8)) + (vehicleIndex === 6 ? 6 : 0);
      cursor += (days + gap) * DAY_MS;
    }
  });

  // Today's operational picture.
  const [vios, city, van, fortuner, mirage, innova] = DEMO_VEHICLES;
  // Due back later today: a few hours from now, but never past Manila midnight.
  const dueSoon = Math.min(now.getTime() + 3 * HOUR_MS, todayStart + DAY_MS - HOUR_MS);
  const dueLater = Math.min(now.getTime() + 5 * HOUR_MS, todayStart + DAY_MS - HOUR_MS / 2);
  add(van, dueSoon - 3 * DAY_MS, 3, "active", { customerId: "demo-customer-2" });
  add(fortuner, dueLater - 2 * DAY_MS, 2, "active", { customerId: "demo-customer-5" });
  add(mirage, todayStart - 4 * DAY_MS + 8 * HOUR_MS, 3, "overdue", { customerId: "demo-customer-3" }); // overdue since yesterday
  add(innova, todayStart - 1 * DAY_MS + 10 * HOUR_MS, 4, "active");
  add(vios, todayStart + 15 * HOUR_MS, 2, "reserved", { customerId: "demo-customer", source: "public_web" }); // pickup today
  add(city, todayStart + DAY_MS + 9 * HOUR_MS, 3, "reserved", { source: "public_web" });
  add(van, todayStart + 3 * DAY_MS + 8 * HOUR_MS, 5, "reserved");
  add(fortuner, todayStart + 6 * DAY_MS + 10 * HOUR_MS, 4, "reserved", { source: "public_web" });
  add(vios, todayStart + 9 * DAY_MS + 9 * HOUR_MS, 3, "reserved");
  add(innova, todayStart + 12 * DAY_MS + 9 * HOUR_MS, 6, "reserved", { source: "public_web" });
  add(mirage, todayStart + 18 * DAY_MS + 9 * HOUR_MS, 2, "reserved");
  add(city, todayStart + 5 * DAY_MS + 9 * HOUR_MS, 2, "draft", { source: "public_web" }); // awaiting deposit
  add(fortuner, todayStart + 14 * DAY_MS + 9 * HOUR_MS, 3, "draft", { source: "public_web" });

  return { vehicles: DEMO_VEHICLES, customers: DEMO_CUSTOMERS, rentals, payments };
}

/** Collected money for a set of payments: never penalties; refunds subtract. */
export function demoCollected(payments: DemoPayment[]): number {
  return payments.reduce((total, payment) => {
    if (payment.paymentType === "penalty") return total;
    if (payment.paymentType === "refund") return total - payment.amount;
    return total + payment.amount;
  }, 0);
}
