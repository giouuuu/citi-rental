import { customerDefinition, saveCustomerAction } from "@/features/customers";
import type { ResourceFormProps } from "@/features/shared/types/resource-form";

/**
 * Add a walk-in renter from the rental form's Customer picker. Only what a
 * booking needs is asked here; the rest is filled in later under Customers.
 */
export const RENTAL_QUICK_CREATE: NonNullable<ResourceFormProps["quickCreate"]> = {
  customer_id: {
    label: "New customer",
    description:
      "Just what the booking needs. Add emergency contacts and other details later under Customers.",
    definition: {
      key: customerDefinition.key,
      singular: customerDefinition.singular,
      fields: customerDefinition.fields,
    },
    action: saveCustomerAction,
    hiddenFields: [
      "emergency_contact_name",
      "emergency_contact_number",
      "facebook_profile_url",
      "tracking_consent_at",
      "tracking_disclosure_version",
      "is_blocked",
      "notes",
    ],
    searchField: "full_name",
  },
};
