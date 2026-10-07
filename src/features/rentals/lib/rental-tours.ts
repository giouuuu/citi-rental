import type { ProductTourStep } from "@/features/shared/components/product-tour";

/** /rentals/new — booking a car at the counter. */
export const MANUAL_RENTAL_TOUR: ProductTourStep[] = [
  {
    title: "Book a car at the counter",
    description:
      "This takes about a minute. Any Available car can be rented here, even one still waiting for its photos.",
  },
  {
    element: '[data-field="reference_number"]',
    title: "Reference number",
    description:
      "We fill one in for you. Keep it, or type the number on your paper contract.",
  },
  {
    element: '[data-field="customer_id"]',
    title: "Customer",
    description:
      "Pick the renter. New renter? Click New customer to add them without leaving this page. Blocked customers are hidden.",
  },
  {
    element: '[data-field="vehicle_id"]',
    title: "Car",
    description:
      "Every Available car is listed, with or without photos. Cars in maintenance or inactive are hidden.",
  },
  {
    element: '[data-field="start_at"] [data-slot="calendar"]',
    title: "Rental dates",
    description:
      "Click the pickup day, then the return day, then set both times below. Hatched days are already booked for this car.",
    side: "top",
  },
  {
    element: '[data-field="quoted_daily_rate"]',
    title: "Daily rate",
    description:
      "Leave it blank to use the car's rate, or type the price you agreed. Rent is the rate × the days.",
  },
  {
    element: '[data-field="tracking_consent_at"]',
    title: "GPS consent",
    description:
      "Set this when the renter signs the GPS tracking consent. The car can't go out without it.",
  },
  {
    element: "[data-resource-submit]",
    title: "Save",
    description:
      "The rental is saved as a draft. Open its Bill & payments tab to add car wash, delivery, or other fees and to take payments.",
    side: "top",
  },
];

/** /rentals/[id]?tab=payments — the running bill. */
export const RENTAL_BILL_TOUR: ProductTourStep[] = [
  {
    element: '[data-tour="rental-bill"]',
    title: "The running bill",
    description:
      "Rent plus every charge, less what the renter has paid. The balance updates the moment you add or remove something.",
  },
  {
    element: '[data-tour="add-charge"]',
    title: "Add a charge",
    description:
      "Car wash, delivery, fuel shortage, extension, or other income. All optional. The amount fills in from Settings → Charge types, and you can change it.",
  },
  {
    element: '[data-tour="record-payment"]',
    title: "Record a payment",
    description:
      "Log cash, GCash, Maya, or bank payments here. Use Discount / adjustment to take money off the bill.",
  },
  {
    element: '[data-tour="extend-rental"]',
    title: "Extend",
    description:
      "Renter keeping the car longer? Extend moves the return date, checks the next booking, and adds the extra days to the bill.",
  },
];
