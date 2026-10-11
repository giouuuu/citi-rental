import {
  facebookPageLinks,
  type ContactChannelValues,
} from "@/features/settings/lib/contact-channels";

/** Shown to the renter when the owner has not written their own note. */
export const DEFAULT_THANK_YOU_MESSAGE =
  "Thank you for renting with Zeke Car Rental & Services! We hope you had a great trip. If you enjoyed it, a quick review on Google or Facebook helps other travelers find us.";

/** Where the completed-rental review buttons go, and the note above them. */
export type ReviewLinks = {
  google: string | null;
  facebook: string | null;
  thankYou: string;
};

const httpUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
};

/**
 * The saved review settings, with the Facebook button falling back to the
 * Facebook page's reviews tab when no review link is set.
 */
export function resolveReviewLinks(
  saved: { google?: string | null; facebook?: string | null; thankYou?: string | null },
  contact: Partial<ContactChannelValues>,
): ReviewLinks {
  return {
    google: httpUrl(saved.google),
    facebook: httpUrl(saved.facebook) ?? facebookPageLinks(contact)?.reviews ?? null,
    thankYou: saved.thankYou?.trim() || DEFAULT_THANK_YOU_MESSAGE,
  };
}
