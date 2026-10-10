import { ContactFab } from "@/components/landing/contact-fab";
import { CONTACT_FAB_AVOID_ATTRIBUTE } from "@/components/landing/contact-fab-avoid";
import { BUSINESS } from "@/features/seo/lib/business";
import { buildContactChannels } from "@/features/settings/lib/contact-channels";
import { getPublicContactChannels } from "@/features/settings/services/get-public-contact-channels";

/**
 * The floating chat button for customer pages outside the landing (booking,
 * pay, account, sign-in), loading the owner's channels itself. Renders
 * nothing when no channel is set in Settings.
 */
export async function CustomerContactFab({
  greeting = `Hi ${BUSINESS.name}! I have a question about my booking.`,
}: {
  greeting?: string;
}) {
  const channels = buildContactChannels(
    await getPublicContactChannels(),
    greeting,
  );
  return (
    <ContactFab
      avoidSelector={`[${CONTACT_FAB_AVOID_ATTRIBUTE}]`}
      channels={channels}
    />
  );
}
